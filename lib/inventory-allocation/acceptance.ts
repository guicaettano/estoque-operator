import type { InventoryUpdatePlan } from "@/lib/inventory-allocation/types";

export type AllocationAcceptanceMetrics = {
  reviewedPlans: number; acceptedWithoutChanges: number; editedPlans: number;
  acceptanceRate: number | null; averageAllocationAdjustment: number | null;
};

export function calculateAllocationAcceptanceMetrics(plans: InventoryUpdatePlan[]): AllocationAcceptanceMetrics {
  const acceptedWithoutChanges = plans.filter((plan) => plan.acceptedSuggestion).length;
  const adjustments = plans.flatMap((plan) => plan.allocations.map((item) => Math.abs(item.allocatedQuantity - item.suggestedQuantity)));
  return { reviewedPlans: plans.length, acceptedWithoutChanges, editedPlans: plans.length - acceptedWithoutChanges,
    acceptanceRate: plans.length ? acceptedWithoutChanges / plans.length : null,
    averageAllocationAdjustment: adjustments.length ? adjustments.reduce((sum, value) => sum + value, 0) / adjustments.length : null };
}
