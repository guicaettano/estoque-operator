import { describe, expect, it } from "vitest";
import { calculateBenchmarkMetrics } from "@/lib/product-matching/benchmark";
import type { ProductMatchResult } from "@/lib/product-matching/types";

describe("matching benchmark", () => {
  it("calculates top-1 accuracy and top-3 recall without inventing a baseline", () => {
    const result = { item: { supplierCode: "10" }, candidates: [{ externalId: "wrong" }, { externalId: "right" }] } as ProductMatchResult;
    expect(calculateBenchmarkMetrics([result], { "10": "right" })).toMatchObject({ evaluated: 1, top1Correct: 0, top3Correct: 1, top1Accuracy: 0, top3Recall: 1 });
  });
});
