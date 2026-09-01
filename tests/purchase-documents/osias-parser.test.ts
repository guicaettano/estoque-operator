import { readFileSync } from "node:fs";
import { join } from "node:path";
import pdf from "pdf-parse";
import { describe, expect, it } from "vitest";
import { parseBrazilianNumber } from "@/lib/incoming-products/normalize";
import { parseOsiasDocument } from "@/lib/purchase-documents/parsers/osias";

describe("OSIAS purchase order parser", () => {
  it("extracts all 28 real items from digital PDF text", async () => {
    const buffer = readFileSync(join(process.cwd(), "tests", "fixtures", "pedido-osias-13506.pdf"));
    const items = parseOsiasDocument((await pdf(buffer)).text);
    expect(items).toHaveLength(28);
    expect(items.find((item) => item.supplierCode === "55022")).toMatchObject({ quantity: 5, unitCost: 4.25, total: 21.25 });
    expect(items.find((item) => item.supplierCode === "55022")?.description).toContain("ANEL ESCAPE DAFRA RIVA");
    expect(items.find((item) => item.supplierCode === "52191")).toMatchObject({ quantity: 2, unitCost: 68.87, total: 137.74 });
    expect(items.find((item) => item.supplierCode === "52191")?.description).toContain("CANELA BENGALA DIR TIT 150 04/08");
    expect(items.find((item) => item.supplierCode === "19944")).toMatchObject({ quantity: 1, unitCost: 9.89 });
    expect(items.find((item) => item.supplierCode === "19944")?.description).toContain("CORRENTE COMANDO SHINERAY XY-50Q");
  });

  it("parses Brazilian thousands and decimal separators", () => {
    expect(parseBrazilianNumber("4,250")).toBe(4.25);
    expect(parseBrazilianNumber("68,870")).toBe(68.87);
    expect(parseBrazilianNumber("1.462,52")).toBe(1462.52);
  });
});
