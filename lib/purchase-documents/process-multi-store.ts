import { buildMultiStoreItemReview } from "@/lib/purchase-documents/multi-store";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { buildProductMatchInput } from "@/lib/product-matching/input";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";
import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { ProductCandidateReranker, ProductMatchResult } from "@/lib/product-matching/types";
import type { ProductRetrievalRepository } from "@/lib/product-matching/retrieval";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";
import type { OperationalStore } from "@/lib/stores/operational-stores";
import { TagPlusProductRetrievalRepository } from "@/lib/tagplus/product-retrieval";

export async function processMultiStoreMatching(input: {
  stores: OperationalStore[];
  userId: string;
  items: PurchaseDocumentItem[];
}, dependencies: {
  repositoryForStore?: (store: OperationalStore) => ProductRetrievalRepository | undefined;
  reranker?: ProductCandidateReranker;
} = {}) {
  const repositories = new Map(input.stores.map((store) => [
    store.id,
    dependencies.repositoryForStore
      ? dependencies.repositoryForStore(store)
      : store.provider === "tagplus" ? new TagPlusProductRetrievalRepository(input.userId) : undefined,
  ]));
  const results = [];

  for (let index = 0; index < input.items.length; index += 4) {
    results.push(...await Promise.all(input.items.slice(index, index + 4).map((rawItem) => {
      const item = buildProductMatchInput(rawItem);
      return buildMultiStoreItemReview({
        item,
        stores: input.stores,
        match: async (store, purchaseItem) => {
          const repository = repositories.get(store.id);
          try {
            return await matchPurchaseDocumentItem(
              { storeId: store.id, provider: store.provider, item: purchaseItem },
              { repository, reranker: dependencies.reranker },
            );
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.warn(`${store.provider}-matching: fallback`, error instanceof Error ? error.message : "unknown error");
            }
            return {
              item: purchaseItem,
              status: "NO_CONFIDENT_MATCH",
              method: "deterministic",
              aiCalled: false,
              normalizedQuery: normalizeProductDescription(purchaseItem.description),
              parsedIntent: parseProductIntent(purchaseItem),
              candidates: [],
              diagnostics: {
                query: purchaseItem.description,
                parsedQuery: parseProductIntent(purchaseItem),
                hydration: repository?.getLastDiagnostics?.() ?? null,
                candidates: [],
              },
            } satisfies ProductMatchResult;
          }
        },
      });
    })));
  }

  if (process.env.NODE_ENV === "development" && results[0]) {
    console.log("[MULTI STORE ITEM]", results[0].item.description, results[0].stores.map((store) => ({
      provider: store.provider,
      storeId: store.storeId,
      candidateCount: store.candidates.length,
      bestExternalId: store.externalId,
      stock: store.currentStock,
      suggestedQuantity: store.suggestedQuantity,
    })));
  }
  return results;
}
