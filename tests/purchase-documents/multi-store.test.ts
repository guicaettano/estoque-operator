import { describe, expect, it, vi } from "vitest";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { scoreProductCandidate } from "@/lib/product-matching/score";
import type { ProductMatchResult } from "@/lib/product-matching/types";
import { buildMultiStoreItemReview } from "@/lib/purchase-documents/multi-store";
import { normalizeGenericPurchaseDocument } from "@/lib/purchase-documents/normalize-document";

const item = { supplierCode: "55022", supplierReference: null, description: "ANEL ESCAPE DAFRA RIVA 150(5,UND) VEDAM", quantity: 5, unitCost: 4.25, total: 21.25 };
const stores = [{ id: "cci-store", name: "R&R MOTOS", provider: "cci" as const }, { id: "tag-store", name: "R&R AUTOPEÇAS", provider: "tagplus" as const }];
function match(provider: "cci" | "tagplus", stock: number | null): ProductMatchResult {
  const parsedIntent = parseProductIntent(item);
  const candidate = scoreProductCandidate(item, { productId: `${provider}-product`, externalId: provider === "cci" ? "984" : "22", description: item.description, stock, costPrice: 4.25, salePrice: 12, barcode: null, reference: null, supplier: null });
  return { item, status: stock === null ? "NO_CONFIDENT_MATCH" : "MATCH_PROBABLE", method: "deterministic", aiCalled: false, normalizedQuery: item.description, parsedIntent, candidates: stock === null ? [] : [candidate] };
}

describe("resposta multi-loja do pedido", () => {
  it("consulta cada provider de forma isolada e devolve duas alocações para o item 55022", async () => {
    const matcher = vi.fn(async (store: typeof stores[number]) => store.provider === "cci" ? match("cci", 5) : match("tagplus", 3));
    const result = await buildMultiStoreItemReview({ item, stores, match: matcher });
    expect(matcher).toHaveBeenCalledTimes(2); expect(matcher.mock.calls.map(([store]) => store.provider)).toEqual(["cci", "tagplus"]);
    expect(result.stores.map((store) => store.provider)).toEqual(["cci", "tagplus"]); expect(result.stores.reduce((sum, store) => sum + store.suggestedQuantity, 0)).toBe(5);
  });
  it("mantém TagPlus no payload mesmo sem candidato", async () => {
    const result = await buildMultiStoreItemReview({ item, stores, match: async (store) => store.provider === "cci" ? match("cci", 5) : match("tagplus", null) });
    expect(result.stores[1].provider).toBe("tagplus"); expect(result.stores[1].candidates).toEqual([]); expect(result.stores[1].status).toBe("NO_CONFIDENT_MATCH");
  });
  it("calcula estoque previsto com quantidade destinada, não com quantidade total", async () => {
    const result = await buildMultiStoreItemReview({ item, stores, match: async (store) => store.provider === "cci" ? match("cci", 5) : match("tagplus", 3) });
    const edited = result.stores.map((store, index) => ({ ...store, allocatedQuantity: index === 0 ? 2 : 3, predictedStock: (store.currentStock ?? 0) + (index === 0 ? 2 : 3) }));
    expect(edited.map((store) => store.predictedStock)).toEqual([7, 6]); expect(edited.reduce((sum, store) => sum + store.allocatedQuantity, 0)).toBe(5);
  });
  it("recebe item de parser genérico pelo mesmo pipeline e consulta CCI e TagPlus", async () => {
    const document = normalizeGenericPurchaseDocument({
      source: "pdf",
      products: [{ code: "14610KSP910", description: "GUIA CORRENTE COMANDO", unit: "UN", quantity: 2, unitCost: 33.99 }],
    });
    const matcher = vi.fn(async (store: typeof stores[number]) => store.provider === "cci" ? match("cci", 5) : match("tagplus", 3));

    const result = await buildMultiStoreItemReview({ item: document.items[0], stores, match: matcher });

    expect(matcher.mock.calls.map(([store]) => store.provider)).toEqual(["cci", "tagplus"]);
    expect(result.item).toMatchObject({ supplierCode: "14610KSP910", description: "GUIA CORRENTE COMANDO", unit: "UN" });
    expect(result.stores.map((store) => store.provider)).toEqual(["cci", "tagplus"]);
  });
});
