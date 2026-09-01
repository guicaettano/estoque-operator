export type InventoryProvider = "cci" | "tagplus";
export type DataQuality = "low" | "medium" | "high";
export type NecessityLevel = "low" | "medium" | "high" | "critical";
export type AllocationMethod = "deterministic" | "ai" | "manual";

export type ProductStoreMetrics = {
  storeId: string; storeName: string; provider: InventoryProvider;
  productId: string | null; externalId: string | null; productDescription: string | null;
  currentStock: number | null;
  sales7d: number | null; sales30d: number | null; sales90d: number | null;
  avgDailySales30d: number | null; daysOfCover: number | null;
  minimumStock?: number | null;
  lastSaleAt: string | null; dataQuality: DataQuality;
  currentCost: number | null; currentSalePrice: number | null; eligible: boolean;
};

export type StoreAllocation = ProductStoreMetrics & {
  suggestedQuantity: number; allocatedQuantity: number; predictedStock: number | null;
  newCost: number | null; newSalePrice: number | null; allocationMethod: AllocationMethod;
  necessityScore: number; necessityLevel: NecessityLevel; reason: string; confidence: number | null;
  requiresProductCreation: boolean;
};

export type AllocationSuggestion = {
  incomingQuantity: number; precision: number; method: Exclude<AllocationMethod, "manual">;
  allocations: StoreAllocation[]; explanation: string; aiCalled: boolean; fallbackReason: string | null;
};

export type InventoryUpdatePlan = {
  status: "prepared"; createdAt: string; supplierCode: string | null; incomingDescription: string;
  incomingQuantity: number; allocations: StoreAllocation[]; acceptedSuggestion: boolean;
};

