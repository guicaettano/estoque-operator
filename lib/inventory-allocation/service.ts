import { requestAiAllocation } from "@/lib/inventory-allocation/ai";
import { buildDeterministicAllocation } from "@/lib/inventory-allocation/baseline";
import type { AllocationSuggestion, ProductStoreMetrics } from "@/lib/inventory-allocation/types";
import { validateAllocationSuggestion } from "@/lib/inventory-allocation/validation";

export type SuggestAllocationInput = {
  incomingQuantity: number;
  stores: ProductStoreMetrics[];
  newCost: number | null;
  precision?: number;
  useAi?: boolean;
};

export async function suggestAllocation(input: SuggestAllocationInput): Promise<AllocationSuggestion> {
  const baseline = buildDeterministicAllocation(input);
  const eligible = input.stores.filter((store) => store.eligible);
  if (!input.useAi) return baseline;
  if (eligible.length < 2) return { ...baseline, fallbackReason: "A IA não é necessária quando existe somente uma loja elegível." };
  if (!eligible.some((store) => store.dataQuality !== "low")) {
    return { ...baseline, fallbackReason: "Histórico de vendas insuficiente; mantida a sugestão determinística baseada em estoque." };
  }
  try {
    const ai = await requestAiAllocation({ incomingQuantity: input.incomingQuantity, precision: baseline.precision, stores: eligible, baseline });
    assertExactStoreSet(ai.allocations.map((allocation) => allocation.storeId), eligible);
    const aiByStore = new Map(ai.allocations.map((allocation) => [allocation.storeId, allocation]));
    const suggestion: AllocationSuggestion = {
      ...baseline,
      method: "ai",
      aiCalled: true,
      explanation: ai.explanation,
      allocations: baseline.allocations.map((allocation) => {
        const result = aiByStore.get(allocation.storeId);
        return result ? {
          ...allocation,
          suggestedQuantity: result.quantity,
          allocatedQuantity: result.quantity,
          predictedStock: allocation.currentStock === null ? null : allocation.currentStock + result.quantity,
          allocationMethod: "ai" as const,
          reason: result.reason,
          confidence: result.confidence,
        } : allocation;
      }),
    };
    const errors = validateAllocationSuggestion(suggestion, input.stores);
    if (errors.length) throw new Error(errors.join(" "));
    return suggestion;
  } catch (error) {
    return { ...baseline, aiCalled: true, fallbackReason: error instanceof Error ? error.message : "Sugestão de IA inválida." };
  }
}

function assertExactStoreSet(returnedIds: string[], eligible: ProductStoreMetrics[]) {
  const eligibleIds = new Set(eligible.map((store) => store.storeId));
  const returned = new Set(returnedIds);
  const unknown = returnedIds.find((id) => !eligibleIds.has(id));
  if (unknown) throw new Error(`Loja desconhecida retornada pela IA: ${unknown}.`);
  if (returned.size !== returnedIds.length) throw new Error("A IA retornou uma loja duplicada.");
  if (returned.size !== eligibleIds.size || [...eligibleIds].some((id) => !returned.has(id))) {
    throw new Error("A IA não retornou todas as lojas elegíveis.");
  }
}

