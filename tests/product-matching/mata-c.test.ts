import { describe, expect, it } from "vitest";
import { evaluateProductCompatibility } from "@/lib/product-matching/compatibility";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";

const item = (description: string) => ({ supplierCode: null, supplierReference: null, description, quantity: 1, unitCost: 1, total: 1 });

describe("MATA C. compatibility", () => {
  it.each(["MATA C.", "MATA-CACHORRO", "MATA CACHORRO", "MATA CAO"])("normalizes %s as a front protector", (alias) => {
    expect(normalizeProductDescription(`${alias} C/TELA TITAN 150 04/08`)).toContain("PROTETOR DIANTEIRO");
    expect(parseProductIntent(item(`${alias} C/TELA TITAN 150 04/08`)).partType).toBe("PROTETOR DIANTEIRO");
  });

  it("is compatible with a front protector", () => {
    const query = parseProductIntent(item("MATA C. C/TELA TITAN 150 04/08 CROM TORK SPORT"));
    const candidate = parseProductIntent(item("PROTETOR DIANTEIRO TITAN 150 04/08 CROM - TORK"));
    expect(evaluateProductCompatibility(query, candidate)).toMatchObject({
      partTypeCompatibility: "COMPATIBLE",
      queryPartTypeCanonical: "PROTETOR DIANTEIRO",
      candidatePartTypeCanonical: "PROTETOR DIANTEIRO",
      hardConflicts: [],
    });
  });

  it("rejects an exhaust protector as an explicit part-type conflict", () => {
    const query = parseProductIntent(item("MATA C. C/TELA TITAN 150 04/08"));
    const candidate = parseProductIntent(item("PROTECAO ESCAPAMENTO TITAN 150 04/08"));
    expect(evaluateProductCompatibility(query, candidate)).toMatchObject({
      partTypeCompatibility: "CONFLICT",
      queryPartTypeCanonical: "PROTETOR DIANTEIRO",
      candidatePartTypeCanonical: "PROTETOR ESCAPAMENTO",
      hardConflicts: ["partType"],
    });
  });
});
