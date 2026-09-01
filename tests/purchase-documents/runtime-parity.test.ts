import { describe, expect, it, vi } from "vitest";
import type { ProductRetrievalRepository } from "@/lib/product-matching/retrieval";
import type { ErpProductRecord, ProductCandidateReranker } from "@/lib/product-matching/types";
import { normalizeGenericPurchaseDocument } from "@/lib/purchase-documents/normalize-document";
import { processMultiStoreMatching } from "@/lib/purchase-documents/process-multi-store";

const correct: ErpProductRecord = {
  productId: "4643",
  externalId: "4643",
  description: "AMORTECEDOR MOTO TITAN 150/FAN 150 - COFAP CR22540M",
  stock: 1,
  costPrice: 1,
  salePrice: 2,
  barcode: null,
  reference: null,
  supplier: "COFAP",
  searchText: "AMORTECEDOR MOTO TITAN 150 FAN 150 COFAP CR22540M",
};

describe("runtime and harness input parity", () => {
  it("sends the parsed supplier reference through the real multi-store matching path", async () => {
    const document = normalizeGenericPurchaseDocument({
      source: "pdf",
      products: [{ code: "00089031003161", description: "CR22540M AMORTECEDOR TRASEIRO C/REGULAGEM", quantity: 2, unitCost: 79.29, unit: "PC" }],
    });
    const search = vi.fn().mockResolvedValue([correct]);
    const repository: ProductRetrievalRepository = { search };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({
      bestExternalId: "4643",
      confidence: 0.99,
      status: "MATCH_PROBABLE",
      reason: "Referência exata.",
      ranking: [{ externalId: "4643", confidence: 0.99, reason: "Referência exata." }],
    }) };

    const [review] = await processMultiStoreMatching({
      stores: [{ id: "tag-store", name: "TagPlus", provider: "tagplus" }],
      userId: "test-user",
      items: document.items,
    }, { repositoryForStore: () => repository, reranker });

    expect(search.mock.calls[0]?.[0]).toMatchObject({
      item: {
        supplierCode: "00089031003161",
        supplierReference: "CR22540M",
        barcode: null,
        description: "AMORTECEDOR TRASEIRO C/REGULAGEM",
      },
      references: ["CR22540M", "00089031003161"],
    });
    expect(review.stores[0]).toMatchObject({ status: "MATCH_PROBABLE", selectedExternalId: "4643" });
  });
});
