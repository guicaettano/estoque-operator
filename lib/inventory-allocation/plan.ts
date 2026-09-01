import type { AllocationSuggestion, InventoryUpdatePlan } from "@/lib/inventory-allocation/types";

export function buildInventoryUpdatePlan(input: {
  supplierCode: string | null;
  incomingDescription: string;
  suggestion: AllocationSuggestion;
}): InventoryUpdatePlan {
  return {
    status: "prepared",
    createdAt: new Date().toISOString(),
    supplierCode: input.supplierCode,
    incomingDescription: input.incomingDescription,
    incomingQuantity: input.suggestion.incomingQuantity,
    allocations: input.suggestion.allocations,
    acceptedSuggestion: input.suggestion.allocations.every((allocation) => allocation.allocatedQuantity === allocation.suggestedQuantity),
  };
}

