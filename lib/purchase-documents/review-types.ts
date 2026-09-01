import type { InventoryUpdatePlan } from "@/lib/inventory-allocation/types";
import type { MatchMethod, ReviewItemStatus } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

export type ItemReviewTelemetry = {
  candidateInitiallySelected: string | null;
  finalSelectedExternalId: string | null;
  initialRankAccepted: number | null;
  manualSearchUsed: boolean;
  noMatch: boolean;
  newProduct: boolean;
  reviewDurationMs: number;
};

export type DocumentReviewTelemetry = {
  totalReviewDurationMs: number;
  itemsProcessed: number;
  top1AcceptedCount: number;
  top2To5AcceptedCount: number;
  manualSearchCount: number;
  newProductCount: number;
  noMatchCount: number;
};

export type PurchaseReviewDecision = {
  item: PurchaseDocumentItem;
  status: Exclude<ReviewItemStatus, "pending">;
  selectedProductId: string | null;
  selectedExternalId: string | null;
  deterministicScore: number | null;
  aiConfidence: number | null;
  matchMethod: MatchMethod | null;
  inventoryUpdatePlan?: InventoryUpdatePlan | null;
  reviewTelemetry?: ItemReviewTelemetry;
};

export type ConfirmPurchaseReviewInput = {
  userId: string;
  storeId: string;
  provider: "cci" | "multi_store";
  supplierName: string;
  sourceFilename: string;
  decisions: PurchaseReviewDecision[];
  reviewTelemetry?: DocumentReviewTelemetry;
};
