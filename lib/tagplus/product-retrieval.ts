import { MATCHING_CONFIG } from "@/lib/product-matching/config";
import { SupabaseProductRetrievalRepository, type ProductRetrievalRepository, type ProductSearchRequest } from "@/lib/product-matching/retrieval";
import type { ErpProductRecord, ProductRetrievalDiagnostics } from "@/lib/product-matching/types";
import { persistTagPlusProducts } from "@/lib/tagplus/catalog-persistence";
import { TAGPLUS_API_BASE_URL, parseProductsResponse } from "@/lib/tagplus/oauth";
import { getTagPlusProductCode, getTagPlusProductDescription, getTagPlusProductStock } from "@/lib/tagplus/products";
import { getValidTagPlusAccessToken } from "@/lib/tagplus/service";
import type { TagPlusProduct } from "@/lib/tagplus/types";

export class TagPlusProductRetrievalRepository implements ProductRetrievalRepository {
  private readonly cached = new SupabaseProductRetrievalRepository();
  private lastDiagnostics: ProductRetrievalDiagnostics = emptyDiagnostics();
  constructor(private readonly userId: string) {}
  getLastDiagnostics(): ProductRetrievalDiagnostics { return { ...this.lastDiagnostics }; }
  async search(request: ProductSearchRequest): Promise<ErpProductRecord[]> {
    this.lastDiagnostics = emptyDiagnostics();
    const cachedPromise = this.cached.search(request)
      .then((products) => ({ products, error: null as string | null }))
      .catch((error) => ({ products: [] as ErpProductRecord[], error: errorMessage(error) }));
    let live: ErpProductRecord[];
    try {
      const queries = buildQueries(request);
      let token = await getValidTagPlusAccessToken(this.userId);
      let responses = await Promise.all(queries.map((query) => requestProducts(token, query, request.limit)));
      if (responses.some((result) => result.response.status === 401)) {
        token = await getValidTagPlusAccessToken(this.userId, true);
        responses = await Promise.all(queries.map((query) => requestProducts(token, query, request.limit)));
      }
      const failed = responses.find((result) => !result.response.ok);
      if (failed) throw new Error(`TagPlus HTTP ${failed.response.status} ${failed.response.statusText}`);
      live = uniqueProducts(usefulProducts(responses.flatMap((result) => parseProductsResponse(result.payload)))).map(toErpProduct);
      this.lastDiagnostics.liveSucceeded = true;
      this.lastDiagnostics.liveCandidateCount = live.length;
    } catch (error) {
      const cachedResult = await cachedPromise;
      this.lastDiagnostics = {
        ...this.lastDiagnostics,
        cachedCandidateCount: cachedResult.products.length,
        cachedReadError: cachedResult.error,
        liveSucceeded: false,
        hydrationError: errorMessage(error),
      };
      if (cachedResult.error) throw new Error(`Falha no catálogo TagPlus live e no cache ERP: ${errorMessage(error)}; cache: ${cachedResult.error}`);
      return cachedResult.products;
    }
    const cachedResult = await cachedPromise;
    const cached = cachedResult.products;
    this.lastDiagnostics.cachedCandidateCount = cached.length;
    this.lastDiagnostics.cachedReadError = cachedResult.error;
    await cacheProducts(request.scope.storeId, live).catch((error) => {
      this.lastDiagnostics.cacheWriteError = errorMessage(error);
      if (process.env.NODE_ENV === "development") console.warn("tagplus-matching: cache fallback", errorMessage(error));
    });
    const unique = new Map(cached.map((product) => [product.externalId, product]));
    for (const product of live) { const previous = unique.get(product.externalId); unique.set(product.externalId, previous ? { ...product, retrievalLexicalScore: previous.retrievalLexicalScore, retrievalSemanticScore: previous.retrievalSemanticScore } : product); }
    return [...unique.values()];
  }
}
function emptyDiagnostics(): ProductRetrievalDiagnostics { return { source: "tagplus_live", cachedCandidateCount: null, cachedReadError: null, liveAttempted: true, liveSucceeded: null, liveCandidateCount: null, hydrationError: null, cacheWriteError: null }; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "unknown error"; }
function buildQueries(request: ProductSearchRequest) { const intent = request.intent; return [...new Set([request.references[0], intent.partType, intent.partType && intent.vehicleModels[0] ? `${intent.partType} ${intent.vehicleModels[0]}` : null, ...intent.specifications, ...intent.vehicleModels, request.terms.slice(0, 6).join(" "), ...request.terms.filter((term) => term.length >= 3).slice(-3)].filter((value): value is string => !!value))].slice(0, 7); }
async function requestProducts(token: string, query: string, limit: number) { const url = new URL(`${TAGPLUS_API_BASE_URL}/produtos`); url.searchParams.set("fields", "*"); url.searchParams.set("per_page", String(Math.max(limit * 2, MATCHING_CONFIG.retrievalLimit))); if (query) url.searchParams.set("q", query); const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "X-Api-Version": "2.0", Accept: "application/json" }, cache: "no-store" }); return { response, payload: await response.json().catch(() => null) }; }
async function cacheProducts(storeId: string, products: ErpProductRecord[]) {
  if (!products.length) return;
  await persistTagPlusProducts({ storeId, products, mode: "preserve_existing_semantics" });
}
function usefulProducts(products: TagPlusProduct[]) { return products.filter((product) => product.ativo !== false && getTagPlusProductDescription(product) !== "Produto sem descrição"); }
function uniqueProducts(products: TagPlusProduct[]) { const unique = new Map<string, TagPlusProduct>(); for (const [index, product] of products.entries()) unique.set(text(product.id) ?? getTagPlusProductCode(product) ?? `tagplus-${index}`, product); return [...unique.values()]; }
function toErpProduct(product: TagPlusProduct, index: number): ErpProductRecord {
  const description = getTagPlusProductDescription(product);
  const barcode = text(product.codigo_barras ?? product.ean);
  const reference = text(product.referencia ?? product.codigo_fabricante);
  const supplier = text(product.fornecedor ?? product.marca);
  return { productId: text(product.id) ?? getTagPlusProductCode(product) ?? `tagplus-${index}`, externalId: text(product.id) ?? getTagPlusProductCode(product) ?? `tagplus-${index}`, description, stock: number(getTagPlusProductStock(product)), costPrice: number(product.custo ?? product.valor_custo ?? product.custo_medio), salePrice: number(product.valor_venda ?? product.preco_venda ?? product.valor_venda_varejo), barcode, reference, supplier, searchText: [description, reference, barcode, supplier].filter(Boolean).join(" "), rawData: product };
}
function text(value: unknown): string | null { return typeof value === "string" || typeof value === "number" ? String(value) : null; }
function number(value: unknown): number | null { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; }
