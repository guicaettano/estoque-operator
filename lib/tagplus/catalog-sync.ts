import {
  addTagPlusWriteMetrics,
  emptyTagPlusWriteMetrics,
  persistTagPlusProducts,
  type TagPlusCatalogWriteMetrics,
} from "@/lib/tagplus/catalog-persistence";
import type { ErpProductRecord } from "@/lib/product-matching/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TAGPLUS_API_BASE_URL, parseProductsResponse } from "@/lib/tagplus/oauth";
import { getTagPlusProductCode, getTagPlusProductDescription, getTagPlusProductStock } from "@/lib/tagplus/products";
import { getValidTagPlusAccessToken } from "@/lib/tagplus/service";
import type { TagPlusProduct } from "@/lib/tagplus/types";

const PER_PAGE = 50;
const MAX_PAGES = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

export type TagPlusCatalogSyncMetrics = TagPlusCatalogWriteMetrics & {
  storeId: string;
  provider: "tagplus";
  pagesFetched: number;
  productsFetched: number;
  productsUpserted: number;
  durationMs: number;
};

export type ErpProductCoverage = {
  provider: "cci" | "tagplus";
  totalProducts: number;
  indexedProducts: number;
  missingEmbeddings: number;
  coveragePercentage: number;
};

type PageResult = { status: number; products: TagPlusProduct[] };
type StoreOwner = { provider: string; userId: string };
type Dependencies = {
  loadStore?: (storeId: string) => Promise<StoreOwner>;
  getAccessToken?: (userId: string, forceRefresh?: boolean) => Promise<string>;
  fetchPage?: (accessToken: string, page: number, perPage: number) => Promise<PageResult>;
  upsertProducts?: (storeId: string, products: ErpProductRecord[]) => Promise<TagPlusCatalogWriteMetrics>;
  now?: () => number;
  log?: (message: string) => void;
  perPage?: number;
  maxPages?: number;
};

export class TagPlusCatalogSyncError extends Error {
  constructor(message: string, readonly metrics: TagPlusCatalogSyncMetrics, readonly page: number) {
    super(message);
  }
}

export async function syncTagPlusCatalog(
  input: { storeId: string },
  dependencies: Dependencies = {},
): Promise<TagPlusCatalogSyncMetrics> {
  const now = dependencies.now ?? Date.now;
  const log = dependencies.log ?? ((message: string) => {
    if (process.env.NODE_ENV === "development") console.info(message);
  });
  const perPage = Math.min(Math.max(dependencies.perPage ?? PER_PAGE, 1), 100);
  const maxPages = Math.max(dependencies.maxPages ?? MAX_PAGES, 1);
  const writeMetrics = emptyTagPlusWriteMetrics();
  const metrics: TagPlusCatalogSyncMetrics = {
    storeId: input.storeId,
    provider: "tagplus",
    pagesFetched: 0,
    productsFetched: 0,
    productsUpserted: 0,
    durationMs: 0,
    ...writeMetrics,
  };
  const startedAt = now();
  const finish = () => ({ ...metrics, durationMs: now() - startedAt });
  const complete = () => {
    const result = finish();
    log(formatSyncSummary(result));
    return result;
  };
  const loadStore = dependencies.loadStore ?? loadTagPlusStore;
  const getAccessToken = dependencies.getAccessToken ?? getValidTagPlusAccessToken;
  const fetchPage = dependencies.fetchPage ?? fetchTagPlusProductsPage;
  const upsertProducts = dependencies.upsertProducts ?? upsertTagPlusProducts;
  const store = await loadStore(input.storeId);
  if (store.provider !== "tagplus") throw new Error("A loja informada não usa TagPlus.");
  let accessToken = await getAccessToken(store.userId);
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    let result: PageResult;
    try {
      result = await fetchPage(accessToken, page, perPage);
      if (result.status === 401) {
        accessToken = await getAccessToken(store.userId, true);
        result = await fetchPage(accessToken, page, perPage);
      }
    } catch (error) {
      throw new TagPlusCatalogSyncError(
        `Falha ao buscar a página ${page} do catálogo TagPlus: ${error instanceof Error ? error.message : "erro de rede"}`,
        finish(),
        page,
      );
    }
    metrics.pagesFetched += 1;
    if (result.status < 200 || result.status >= 300) {
      throw new TagPlusCatalogSyncError(`Falha ao buscar a página ${page} do catálogo TagPlus (HTTP ${result.status}).`, finish(), page);
    }
    if (!result.products.length) return complete();
    const signature = result.products.map((product) => text(product.id) ?? "<sem-id>").join(",");
    if (seen.has(signature)) {
      throw new TagPlusCatalogSyncError(`A API TagPlus repetiu a página ${page}; sync interrompido para evitar loop infinito.`, finish(), page);
    }
    seen.add(signature);
    let products: ErpProductRecord[];
    try {
      products = result.products.map((product, index) => toErpProduct(product, index, true));
    } catch (error) {
      throw new TagPlusCatalogSyncError(error instanceof Error ? error.message : "Produto TagPlus inválido.", finish(), page);
    }
    metrics.productsFetched += result.products.length;
    const persisted = await upsertProducts(input.storeId, products);
    addTagPlusWriteMetrics(metrics, persisted);
    metrics.productsUpserted += persisted.productsProcessed;
    if (result.products.length < perPage) return complete();
  }
  throw new TagPlusCatalogSyncError(`O catálogo TagPlus excedeu o limite de ${maxPages} páginas; sync interrompido.`, finish(), maxPages);
}

export async function getErpProductCoverage(): Promise<ErpProductCoverage[]> {
  const client = createSupabaseAdminClient();
  return Promise.all((["cci", "tagplus"] as const).map(async (provider) => {
    const [{ count: totalProducts, error: totalError }, { count: indexedProducts, error: indexedError }] = await Promise.all([
      client.from("erp_products").select("id", { count: "exact", head: true }).eq("provider", provider),
      client.from("erp_products").select("id", { count: "exact", head: true }).eq("provider", provider).not("embedding", "is", null),
    ]);
    if (totalError || indexedError) throw new Error("Não foi possível consultar a cobertura do catálogo ERP.");
    const total = totalProducts ?? 0;
    const indexed = indexedProducts ?? 0;
    return {
      provider,
      totalProducts: total,
      indexedProducts: indexed,
      missingEmbeddings: Math.max(0, total - indexed),
      coveragePercentage: total ? Number(((indexed / total) * 100).toFixed(2)) : 100,
    };
  }));
}

function formatSyncSummary(metrics: TagPlusCatalogSyncMetrics): string {
  return [
    `Processed: ${metrics.productsProcessed}`,
    `Inserted: ${metrics.productsInserted}`,
    `Updated: ${metrics.productsUpdated}`,
    `Updated operational fields: ${metrics.operationalFieldsChanged}`,
    `Semantic changes: ${metrics.semanticFieldsChanged}`,
    `Embeddings invalidated: ${metrics.embeddingsInvalidated}`,
    `Embeddings preserved: ${metrics.embeddingsPreserved}`,
  ].join(" | ");
}

async function loadTagPlusStore(storeId: string): Promise<StoreOwner> {
  const { data, error } = await createSupabaseAdminClient().from("stores")
    .select("provider, created_by").eq("id", storeId).maybeSingle();
  if (error || !data) throw new Error("Loja TagPlus não encontrada.");
  return { provider: String(data.provider), userId: String(data.created_by) };
}

async function fetchTagPlusProductsPage(accessToken: string, page: number, perPage: number): Promise<PageResult> {
  const url = new URL(`${TAGPLUS_API_BASE_URL}/produtos`);
  url.searchParams.set("fields", "*");
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Api-Version": "2.0", Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, products: response.ok ? parseProductsResponse(payload) : [] };
}

async function upsertTagPlusProducts(storeId: string, products: ErpProductRecord[]): Promise<TagPlusCatalogWriteMetrics> {
  return persistTagPlusProducts({ storeId, products, mode: "authoritative" });
}

function toErpProduct(product: TagPlusProduct, index: number, requireId: boolean): ErpProductRecord {
  const id = text(product.id);
  if (requireId && !id) throw new Error(`Produto TagPlus sem id real na posição ${index + 1}.`);
  const externalId = id ?? getTagPlusProductCode(product) ?? `tagplus-${index}`;
  return {
    productId: externalId,
    externalId,
    description: getTagPlusProductDescription(product),
    stock: number(getTagPlusProductStock(product)),
    costPrice: number(product.custo ?? product.valor_custo ?? product.custo_medio),
    salePrice: number(product.valor_venda ?? product.preco_venda ?? product.valor_venda_varejo),
    barcode: text(product.codigo_barras ?? product.ean),
    reference: text(product.referencia ?? product.codigo_fabricante),
    supplier: text(product.fornecedor ?? product.marca),
    rawData: product,
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
