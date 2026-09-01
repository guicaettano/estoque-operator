import type { AllocationSuggestion, ProductStoreMetrics } from "@/lib/inventory-allocation/types";

export function validateAllocationSuggestion(suggestion: AllocationSuggestion, knownStores: ProductStoreMetrics[]): string[] {
  const errors: string[] = [];
  const known = new Set(knownStores.map((store) => store.storeId));
  const seen = new Set<string>();
  for (const allocation of suggestion.allocations) {
    if (!known.has(allocation.storeId)) errors.push(`Loja desconhecida: ${allocation.storeId}.`);
    if (seen.has(allocation.storeId)) errors.push(`Loja duplicada: ${allocation.storeId}.`);
    seen.add(allocation.storeId);
    if (!Number.isFinite(allocation.allocatedQuantity) || allocation.allocatedQuantity < 0) errors.push(`Quantidade inválida para ${allocation.storeName}.`);
  }
  const factor = 10 ** suggestion.precision;
  const total = suggestion.allocations.reduce((sum, allocation) => sum + allocation.allocatedQuantity, 0);
  if (Math.round(total * factor) !== Math.round(suggestion.incomingQuantity * factor)) errors.push("A soma distribuída deve ser exatamente igual à quantidade recebida.");
  return errors;
}

export function assertValidAllocationSuggestion(suggestion: AllocationSuggestion, knownStores: ProductStoreMetrics[]) {
  const errors = validateAllocationSuggestion(suggestion, knownStores);
  if (errors.length) throw new Error(errors.join(" "));
}

