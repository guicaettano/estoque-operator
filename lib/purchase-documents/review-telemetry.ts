import type { DocumentReviewTelemetry, ItemReviewTelemetry } from "@/lib/purchase-documents/review-types";

export function summarizeDocumentReview(
  items: ItemReviewTelemetry[],
  totalReviewDurationMs: number,
): DocumentReviewTelemetry {
  return {
    totalReviewDurationMs: nonNegative(totalReviewDurationMs),
    itemsProcessed: items.length,
    top1AcceptedCount: items.filter((item) => item.initialRankAccepted === 1).length,
    top2To5AcceptedCount: items.filter((item) => item.initialRankAccepted !== null && item.initialRankAccepted >= 2 && item.initialRankAccepted <= 5).length,
    manualSearchCount: items.filter((item) => item.manualSearchUsed).length,
    newProductCount: items.filter((item) => item.newProduct).length,
    noMatchCount: items.filter((item) => item.noMatch).length,
  };
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
