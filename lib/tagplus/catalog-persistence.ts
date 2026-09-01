import { buildProductSearchText, hashProductSearchText } from "@/lib/product-matching/search-text";
import type { ErpProductRecord } from "@/lib/product-matching/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const UPSERT_BATCH_SIZE = 50;

export type TagPlusCatalogWriteMetrics = {
  productsProcessed: number;
  productsInserted: number;
  productsUpdated: number;
  operationalFieldsChanged: number;
  semanticFieldsChanged: number;
  embeddingsInvalidated: number;
  embeddingsPreserved: number;
};

export type ExistingTagPlusProduct = {
  external_id: string;
  description: string;
  stock: number | null;
  cost_price: number | null;
  sale_price: number | null;
  barcode: string | null;
  reference: string | null;
  supplier: string | null;
  search_text: string;
  search_text_hash: string | null;
  embedding_updated_at: string | null;
};

export type TagPlusPersistenceMode = "authoritative" | "preserve_existing_semantics";

export function emptyTagPlusWriteMetrics(): TagPlusCatalogWriteMetrics {
  return { productsProcessed: 0, productsInserted: 0, productsUpdated: 0, operationalFieldsChanged: 0, semanticFieldsChanged: 0, embeddingsInvalidated: 0, embeddingsPreserved: 0 };
}

export function addTagPlusWriteMetrics(target: TagPlusCatalogWriteMetrics, source: TagPlusCatalogWriteMetrics): void {
  const keys: Array<keyof TagPlusCatalogWriteMetrics> = [
    "productsProcessed",
    "productsInserted",
    "productsUpdated",
    "operationalFieldsChanged",
    "semanticFieldsChanged",
    "embeddingsInvalidated",
    "embeddingsPreserved",
  ];
  for (const key of keys) target[key] += source[key];
}

export function prepareTagPlusProductUpsert(input: {
  storeId: string;
  product: ErpProductRecord;
  existing: ExistingTagPlusProduct | null;
  mode: TagPlusPersistenceMode;
  syncedAt: string;
}) {
  const incomingSearchText = buildProductSearchText(input.product);
  const incomingHash = hashProductSearchText(incomingSearchText);
  const canonicalSemanticChanged = input.existing !== null && (
    input.existing.description !== input.product.description
    || input.existing.reference !== input.product.reference
    || input.existing.supplier !== input.product.supplier
    || input.existing.barcode !== input.product.barcode
  );
  const preserveExisting = input.existing !== null && (
    input.mode === "preserve_existing_semantics" || !canonicalSemanticChanged
  );
  const searchText = preserveExisting ? input.existing!.search_text : incomingSearchText;
  const searchTextHash = preserveExisting
    ? input.existing!.search_text_hash ?? hashProductSearchText(input.existing!.search_text)
    : incomingHash;
  const existingHash = input.existing
    ? input.existing.search_text_hash ?? hashProductSearchText(input.existing.search_text)
    : null;
  const semanticChanged = input.existing !== null && canonicalSemanticChanged && searchTextHash !== existingHash;
  const operationalChanged = input.existing !== null && (
    !sameNumber(input.existing.stock, input.product.stock)
    || !sameNumber(input.existing.cost_price, input.product.costPrice)
    || !sameNumber(input.existing.sale_price, input.product.salePrice)
  );
  const hadEmbedding = input.existing?.embedding_updated_at !== null && input.existing?.embedding_updated_at !== undefined;

  return {
    row: {
      store_id: input.storeId,
      provider: "tagplus",
      external_id: input.product.externalId,
      description: preserveExisting ? input.existing!.description : input.product.description,
      stock: input.product.stock,
      cost_price: input.product.costPrice,
      sale_price: input.product.salePrice,
      barcode: preserveExisting ? input.existing!.barcode : input.product.barcode,
      reference: preserveExisting ? input.existing!.reference : input.product.reference,
      supplier: preserveExisting ? input.existing!.supplier : input.product.supplier,
      raw_data: input.product.rawData ?? null,
      search_text: searchText,
      search_text_hash: searchTextHash,
      synced_at: input.syncedAt,
    },
    classification: {
      inserted: input.existing === null,
      updated: input.existing !== null,
      operationalChanged,
      semanticChanged,
      embeddingInvalidated: hadEmbedding && semanticChanged,
      embeddingPreserved: hadEmbedding && !semanticChanged,
    },
  };
}

export async function persistTagPlusProducts(input: {
  storeId: string;
  products: ErpProductRecord[];
  mode: TagPlusPersistenceMode;
}): Promise<TagPlusCatalogWriteMetrics> {
  const metrics = emptyTagPlusWriteMetrics();
  if (!input.products.length) return metrics;
  const client = createSupabaseAdminClient();

  for (let index = 0; index < input.products.length; index += UPSERT_BATCH_SIZE) {
    const products = input.products.slice(index, index + UPSERT_BATCH_SIZE);
    const externalIds = products.map((product) => product.externalId);
    const { data, error: readError } = await client.from("erp_products")
      .select("external_id, description, stock, cost_price, sale_price, barcode, reference, supplier, search_text, search_text_hash, embedding_updated_at")
      .eq("store_id", input.storeId)
      .eq("provider", "tagplus")
      .in("external_id", externalIds);
    if (readError) throw new Error(`[SUPABASE_READ_ERROR] Não foi possível comparar produtos TagPlus: ${readError.message}`, { cause: readError });
    const existingById = new Map(((data ?? []) as ExistingTagPlusProduct[]).map((row) => [row.external_id, row]));
    const syncedAt = new Date().toISOString();
    const prepared = products.map((product) => prepareTagPlusProductUpsert({
      storeId: input.storeId,
      product,
      existing: existingById.get(product.externalId) ?? null,
      mode: input.mode,
      syncedAt,
    }));

    for (const { classification } of prepared) {
      metrics.productsProcessed += 1;
      metrics.productsInserted += Number(classification.inserted);
      metrics.productsUpdated += Number(classification.updated);
      metrics.operationalFieldsChanged += Number(classification.operationalChanged);
      metrics.semanticFieldsChanged += Number(classification.semanticChanged);
      metrics.embeddingsInvalidated += Number(classification.embeddingInvalidated);
      metrics.embeddingsPreserved += Number(classification.embeddingPreserved);
    }

    const { error: writeError } = await client.from("erp_products")
      .upsert(prepared.map((entry) => entry.row), { onConflict: "store_id,provider,external_id" });
    if (writeError) throw new Error(`[SUPABASE_WRITE_ERROR] Não foi possível salvar produtos TagPlus: ${writeError.message}`, { cause: writeError });
  }
  return metrics;
}

function sameNumber(first: number | null, second: number | null): boolean {
  return first === second || (first !== null && second !== null && Number(first) === Number(second));
}
