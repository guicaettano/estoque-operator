import { describe, expect, it } from "vitest";
import { calculateRecall, interpretRecallAt30, providerGold, validateGoldDataset } from "@/scripts/retrieval-benchmark-core";
import { osiasMatchingGold } from "@/tests/fixtures/osias-matching-gold";

describe("OSIAS retrieval benchmark", () => {
  it("valida os 28 itens sem transformar UNVERIFIED em ausência", () => {
    expect(() => validateGoldDataset(osiasMatchingGold)).not.toThrow();
    expect(osiasMatchingGold).toHaveLength(28);
    expect(osiasMatchingGold.filter((item) => providerGold(item, "cci").status === "CONFIRMED")).toHaveLength(27);
    expect(osiasMatchingGold.filter((item) => providerGold(item, "tagplus").status === "CONFIRMED")).toHaveLength(21);
    expect(osiasMatchingGold.filter((item) => providerGold(item, "tagplus").status === "NOT_IN_CATALOG")).toHaveLength(2);
    expect(osiasMatchingGold.filter((item) => providerGold(item, "tagplus").status === "UNVERIFIED")).toHaveLength(5);
    expect(providerGold(osiasMatchingGold[0], "tagplus").category).toBe("EXACT_OR_NEAR_EXACT");
  });

  it("calcula Recall@K somente sobre os casos recebidos como confirmados", () => {
    const recall = calculateRecall([
      { supplierCode: "A", rankInRetrieval: 1 },
      { supplierCode: "B", rankInRetrieval: 4 },
      { supplierCode: "C", rankInRetrieval: null },
    ]);
    expect(recall[1]).toBeCloseTo(1 / 3);
    expect(recall[3]).toBeCloseTo(1 / 3);
    expect(recall[5]).toBeCloseTo(2 / 3);
    expect(recall[30]).toBeCloseTo(2 / 3);
  });

  it("usa N/A quando não há gold confirmado", () => {
    expect(calculateRecall([])[30]).toBeNull();
    expect(interpretRecallAt30(null)).toContain("Insufficient confirmed gold data");
  });

  it("aplica as faixas de decisão solicitadas sem alterar o matcher", () => {
    expect(interpretRecallAt30(0.95)).toContain("coverage is strong");
    expect(interpretRecallAt30(0.9)).toContain("usable");
    expect(interpretRecallAt30(0.84)).toContain("main bottleneck");
  });
});
