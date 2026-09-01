import { buildDeterministicAllocation } from "@/lib/inventory-allocation/baseline";
import { normalizeStoreMetrics } from "@/lib/inventory-allocation/metrics";
import type { ProductStoreMetrics, StoreAllocation } from "@/lib/inventory-allocation/types";
import type { ProductMatchResult, ReviewItemStatus } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";
import type { OperationalStore } from "@/lib/stores/operational-stores";

export type MultiStoreItemStore = StoreAllocation & {
  status: ProductMatchResult["status"];
  method: ProductMatchResult["method"];
  candidates: ProductMatchResult["candidates"];
  selectedProductId: string | null;
  selectedExternalId: string | null;
  decisionStatus: ReviewItemStatus;
  matchingDebug: Pick<ProductMatchResult, "normalizedQuery" | "parsedIntent" | "aiCalled" | "diagnostics">;
};

export type MultiStoreItemReview = {
  item: PurchaseDocumentItem;
  stores: MultiStoreItemStore[];
  explanation: string;
  allocationMethod: "deterministic" | "ai";
  confidence: number | null;
};

export async function buildMultiStoreItemReview(input: {
  item: PurchaseDocumentItem;
  stores: OperationalStore[];
  match: (store: OperationalStore, item: PurchaseDocumentItem) => Promise<ProductMatchResult>;
}): Promise<MultiStoreItemReview> {
  const matches = await Promise.all(input.stores.map(async (store) => ({ store, match: await input.match(store, input.item) })));
  const metrics: ProductStoreMetrics[] = matches.map(({ store, match }) => {
    const candidate = match.candidates[0] ?? null;
    return normalizeStoreMetrics({
      storeId: store.id, storeName: store.name, provider: store.provider,
      productId: candidate?.productId ?? null, externalId: candidate?.externalId ?? null, productDescription: candidate?.description ?? null,
      currentStock: candidate?.stock ?? null, sales7d: null, sales30d: null, sales90d: null, minimumStock: null, lastSaleAt: null,
      currentCost: candidate?.costPrice ?? null, currentSalePrice: candidate?.salePrice ?? null,
      eligible: true,
    });
  });
  const suggestion = buildDeterministicAllocation({ incomingQuantity: input.item.quantity, stores: metrics, newCost: input.item.unitCost });
  const allocations = new Map(suggestion.allocations.map((allocation) => [allocation.storeId, allocation]));
  return {
    item: input.item,
    explanation: suggestion.explanation,
    allocationMethod: suggestion.method,
    confidence: averageConfidence(suggestion.allocations),
    stores: matches.map(({ store, match }) => {
      const allocation = allocations.get(store.id);
      if (!allocation) throw new Error("Alocação ausente para loja operacional.");
      const selected = match.candidates[0] ?? null;
      return {
        ...allocation,
        status: match.status,
        method: match.method,
        candidates: match.candidates,
        selectedProductId: selected?.productId ?? null,
        selectedExternalId: selected?.externalId ?? null,
        decisionStatus: "pending",
        matchingDebug: { normalizedQuery: match.normalizedQuery, parsedIntent: match.parsedIntent, aiCalled: match.aiCalled, diagnostics: match.diagnostics },
      };
    }),
  };
}

function averageConfidence(allocations: StoreAllocation[]) {
  const values = allocations.map((allocation) => allocation.confidence).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
