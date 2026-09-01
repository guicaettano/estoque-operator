import type { ProductMatchResult } from "@/lib/product-matching/types";

export type MatchingGroundTruth = Record<string, string>;
export type BenchmarkMetrics = { evaluated: number; top1Correct: number; top3Correct: number; top1Accuracy: number; top3Recall: number };

export function calculateBenchmarkMetrics(results: ProductMatchResult[], groundTruth: MatchingGroundTruth): BenchmarkMetrics {
  let evaluated = 0; let top1Correct = 0; let top3Correct = 0;
  for (const result of results) {
    const code = result.item.supplierCode;
    if (!code || !groundTruth[code]) continue;
    evaluated += 1;
    const ranking = result.candidates.map((candidate) => candidate.externalId);
    if (ranking[0] === groundTruth[code]) top1Correct += 1;
    if (ranking.slice(0, 3).includes(groundTruth[code])) top3Correct += 1;
  }
  return { evaluated, top1Correct, top3Correct, top1Accuracy: evaluated ? top1Correct / evaluated : 0, top3Recall: evaluated ? top3Correct / evaluated : 0 };
}
