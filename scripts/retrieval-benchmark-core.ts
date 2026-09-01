import type { GoldMatchStatus, MatchingGoldItem, RetrievalCaseCategory } from "@/tests/fixtures/osias-matching-gold";
import type { DiagnosticProvider } from "@/scripts/retrieval-diagnostics";

export const RECALL_KS = [1, 3, 5, 10, 20, 30] as const;
export type RecallK = (typeof RECALL_KS)[number];

export type ConfirmedRetrievalResult = {
  supplierCode: string;
  rankInRetrieval: number | null;
};

export function calculateRecall(results: ConfirmedRetrievalResult[]): Record<RecallK, number | null> {
  return Object.fromEntries(RECALL_KS.map((k) => [
    k,
    results.length ? results.filter((result) => result.rankInRetrieval !== null && result.rankInRetrieval <= k).length / results.length : null,
  ])) as Record<RecallK, number | null>;
}

export function interpretRecallAt30(value: number | null): string {
  if (value === null) return "Insufficient confirmed gold data to diagnose retrieval.";
  if (value >= 0.95) return "Retrieval coverage is strong. Main remaining issue is ranking/decision.";
  if (value >= 0.85) return "Retrieval is usable but still losing relevant products.";
  return "Retrieval is the main bottleneck.";
}

export function providerGold(item: MatchingGoldItem, provider: DiagnosticProvider): {
  correctExternalId: string | null;
  status: GoldMatchStatus;
  category: RetrievalCaseCategory;
} {
  const correctExternalId = provider === "cci" ? item.correctCciExternalId : item.correctTagPlusExternalId;
  const status = provider === "cci" ? item.cciVerification : item.tagPlusVerification;
  return {
    correctExternalId,
    status,
    category: status === "UNVERIFIED" || status === "NOT_IN_CATALOG" ? status : item.retrievalCategory,
  };
}

export function validateGoldDataset(items: MatchingGoldItem[]): void {
  if (items.length !== 28) throw new Error(`Gold OSIAS deve conter 28 itens; recebeu ${items.length}.`);
  const codes = new Set<string>();
  for (const item of items) {
    if (codes.has(item.supplierCode)) throw new Error(`supplierCode duplicado no gold: ${item.supplierCode}.`);
    codes.add(item.supplierCode);
    for (const provider of ["cci", "tagplus"] as const) {
      const { correctExternalId, status } = providerGold(item, provider);
      if (status === "CONFIRMED" && !correctExternalId) {
        throw new Error(`${item.supplierCode}/${provider}: CONFIRMED exige externalId.`);
      }
      if (status !== "CONFIRMED" && correctExternalId !== null) {
        throw new Error(`${item.supplierCode}/${provider}: ${status} exige externalId null.`);
      }
      if (status === "UNVERIFIED" && !item.notes?.includes("UNVERIFIED")) {
        throw new Error(`${item.supplierCode}/${provider}: UNVERIFIED deve estar marcado em notes.`);
      }
    }
  }
}
