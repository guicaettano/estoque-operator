import { describe, expect, it } from "vitest";
import {
  prepareTagPlusProductUpsert,
  type ExistingTagPlusProduct,
  type TagPlusPersistenceMode,
} from "@/lib/tagplus/catalog-persistence";
import { buildProductSearchText, hashProductSearchText } from "@/lib/product-matching/search-text";
import type { ErpProductRecord } from "@/lib/product-matching/types";

const baseProduct: ErpProductRecord = {
  productId: "product-1",
  externalId: "6878",
  description: "ACIONADOR CORRENTE COMANDO TITAN 150",
  stock: 8,
  costPrice: 20,
  salePrice: 40,
  barcode: "7890000000001",
  reference: "REF-6878",
  supplier: "MAGNETRON",
  rawData: { descricao: "ACIONADOR CORRENTE COMANDO TITAN 150", referencia: "REF-6878" },
};

function existing(product: ErpProductRecord = baseProduct): ExistingTagPlusProduct {
  const searchText = buildProductSearchText(product);
  return {
    external_id: product.externalId,
    description: product.description,
    stock: product.stock,
    cost_price: product.costPrice,
    sale_price: product.salePrice,
    barcode: product.barcode,
    reference: product.reference,
    supplier: product.supplier,
    search_text: searchText,
    search_text_hash: hashProductSearchText(searchText),
    embedding_updated_at: "2026-08-30T00:00:00.000Z",
  };
}

function prepare(product: ErpProductRecord, current = existing(), mode: TagPlusPersistenceMode = "authoritative") {
  return prepareTagPlusProductUpsert({ storeId: "store-a", product, existing: current, mode, syncedAt: "2026-08-30T01:00:00.000Z" });
}

describe("TagPlus embedding invalidation", () => {
  it("A: preserves embedding when semantic fields and search_text are unchanged", () => {
    expect(prepare({ ...baseProduct }).classification).toMatchObject({ semanticChanged: false, embeddingInvalidated: false, embeddingPreserved: true });
  });

  it("B: preserves embedding when only stock changes", () => {
    expect(prepare({ ...baseProduct, stock: 99 }).classification).toMatchObject({ operationalChanged: true, semanticChanged: false, embeddingInvalidated: false, embeddingPreserved: true });
  });

  it("C: preserves embedding when only cost and price change", () => {
    expect(prepare({ ...baseProduct, costPrice: 25, salePrice: 55 }).classification).toMatchObject({ operationalChanged: true, semanticChanged: false, embeddingInvalidated: false, embeddingPreserved: true });
  });

  it("preserves embedding when only raw payload shape changes", () => {
    const changedRawPayload = { ...baseProduct, rawData: { descricao: baseProduct.description, categoria: "MOTOR", estoque: 999 } };
    const result = prepare(changedRawPayload);
    expect(result.row.search_text).toBe(existing().search_text);
    expect(result.classification).toMatchObject({ semanticChanged: false, embeddingInvalidated: false, embeddingPreserved: true });
  });

  it("D: invalidates embedding when description changes search_text", () => {
    expect(prepare({ ...baseProduct, description: "TENSOR CORRENTE COMANDO TITAN 150" }).classification).toMatchObject({ semanticChanged: true, embeddingInvalidated: true, embeddingPreserved: false });
  });

  it("E: invalidates embedding when reference changes search_text", () => {
    expect(prepare({ ...baseProduct, reference: "REF-NOVA" }).classification).toMatchObject({ semanticChanged: true, embeddingInvalidated: true, embeddingPreserved: false });
  });

  it("F: second identical full-sync pass produces no semantic invalidation", () => {
    const first = prepare({ ...baseProduct });
    const afterFirst = { ...existing(), search_text: first.row.search_text, search_text_hash: first.row.search_text_hash };
    const second = prepare({ ...baseProduct }, afterFirst);
    expect(second.classification).toMatchObject({ semanticChanged: false, embeddingInvalidated: false, embeddingPreserved: true });
  });

  it("progressive cache cannot replace semantic fields of an existing indexed product", () => {
    const partialLiveProduct = { ...baseProduct, description: "RESPOSTA PARCIAL", reference: null, supplier: null, barcode: null, rawData: { estoque: 10 }, stock: 10 };
    const result = prepare(partialLiveProduct, existing(), "preserve_existing_semantics");
    expect(result.row).toMatchObject({ description: baseProduct.description, reference: baseProduct.reference, supplier: baseProduct.supplier, barcode: baseProduct.barcode });
    expect(result.classification).toMatchObject({ semanticChanged: false, embeddingInvalidated: false, embeddingPreserved: true, operationalChanged: true });
  });
});
