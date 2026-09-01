import { describe, expect, it } from "vitest";
import { summarizeDocumentReview } from "@/lib/purchase-documents/review-telemetry";
import type { ItemReviewTelemetry } from "@/lib/purchase-documents/review-types";

const item = (overrides: Partial<ItemReviewTelemetry> = {}): ItemReviewTelemetry => ({
  candidateInitiallySelected: "100",
  finalSelectedExternalId: "100",
  initialRankAccepted: 1,
  manualSearchUsed: false,
  noMatch: false,
  newProduct: false,
  reviewDurationMs: 1000,
  ...overrides,
});

describe("pilot review telemetry", () => {
  it("summarizes human corrections and review outcomes", () => {
    expect(summarizeDocumentReview([
      item(),
      item({ initialRankAccepted: 3, finalSelectedExternalId: "300" }),
      item({ initialRankAccepted: null, manualSearchUsed: true }),
      item({ candidateInitiallySelected: null, finalSelectedExternalId: null, initialRankAccepted: null, noMatch: true, newProduct: true }),
    ], 4500)).toEqual({
      totalReviewDurationMs: 4500,
      itemsProcessed: 4,
      top1AcceptedCount: 1,
      top2To5AcceptedCount: 1,
      manualSearchCount: 1,
      newProductCount: 1,
      noMatchCount: 1,
    });
  });
});
