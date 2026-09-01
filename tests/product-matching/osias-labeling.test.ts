import { describe, expect, it } from "vitest";
import { applyGoldLabelToFixture } from "@/scripts/osias-labeling";

const fixture = `export const osiasMatchingGold = [\n  { supplierCode: "123", description: "PECA", correctCciExternalId: null, correctTagPlusExternalId: null, cciVerification: "UNVERIFIED", tagPlusVerification: "UNVERIFIED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },\n];\n`;

describe("OSIAS interactive labeling persistence", () => {
  it("persists a manually selected candidate only for the selected provider", () => {
    const updated = applyGoldLabelToFixture(fixture, { supplierCode: "123", provider: "tagplus", status: "CONFIRMED", externalId: "6878" });
    expect(updated).toContain('correctCciExternalId: null');
    expect(updated).toContain('correctTagPlusExternalId: "6878"');
    expect(updated).toContain('tagPlusVerification: "CONFIRMED"');
  });

  it("marks human-confirmed catalog absence without inventing an id", () => {
    const updated = applyGoldLabelToFixture(fixture, { supplierCode: "123", provider: "cci", status: "NOT_IN_CATALOG", externalId: null });
    expect(updated).toContain('correctCciExternalId: null');
    expect(updated).toContain('cciVerification: "NOT_IN_CATALOG"');
  });

  it("refuses invalid automated-style decisions", () => {
    expect(() => applyGoldLabelToFixture(fixture, { supplierCode: "123", provider: "cci", status: "CONFIRMED", externalId: null })).toThrow("CONFIRMED exige externalId");
    expect(() => applyGoldLabelToFixture(fixture, { supplierCode: "123", provider: "cci", status: "UNVERIFIED", externalId: "1" })).toThrow("UNVERIFIED exige externalId null");
  });
});
