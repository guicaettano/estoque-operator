import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBrazilianNumber, normalizeIncomingProduct } from "@/lib/incoming-products/normalize";
import { parseProductsFromPdfText } from "@/lib/incoming-products/pdf-parser";
import { parseNfeXml } from "@/lib/incoming-products/xml-parser";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");

describe("incoming-product parsers", () => {
  it("extracts normalized items from an NF-e XML", () => {
    expect(parseNfeXml(fixture("nfe-sample.xml"))).toEqual([{ code: "AB-100", description: "Filtro de óleo", unit: "UN", quantity: 2, unitCost: 15.5 }, { code: "CD-200", description: "Óleo de motor 5W30", unit: "LT", quantity: 4, unitCost: 32.9 }]);
  });
  it("extracts deterministic PDF text lines", () => {
    expect(parseProductsFromPdfText(fixture("pdf-text-sample.txt"))).toHaveLength(2);
  });
  it("extracts table columns preserved from a DANFE PDF", () => {
    expect(parseProductsFromPdfText(fixture("pdf-columnar-sample.txt"))).toEqual([
      { code: "14010KGA308", description: "RETENTOR MOLA VALVUL", unit: "PC", quantity: 2, unitCost: 62.04 },
      { code: "14610KSP910", description: "GUIA CORRENTE COMAND", unit: "UN", quantity: 2, unitCost: 33.99 },
    ]);
  });
  it("extracts supplier order rows with the unit on a continuation line", () => {
    expect(parseProductsFromPdfText(fixture("pdf-osias-order-sample.txt"))).toEqual([
      { code: "55022", description: "ANEL ESCAPE DAFRA RIVA 150(5,UND) VEDAM", unit: "UND", quantity: 5, unitCost: 4.25 },
      { code: "21892", description: "CABO VELOCIMETRO TIT 2000 ES OSI 21892-UND", unit: "UND", quantity: 2, unitCost: 7.57 },
    ]);
  });
  it("extracts currency-based quotation rows without inventing a unit", () => {
    expect(parseProductsFromPdfText(fixture("pdf-currency-quote-sample.txt"))).toEqual([
      { code: "90200271", description: "BOBINA IGNICAO", unit: null, quantity: 1, unitCost: 36.95 },
      { code: "VA0511724", description: "VALVULA ADMISSAO (25.5 X 4.98 X 76.7)", unit: null, quantity: 4, unitCost: 19.18 },
      { code: "3MTB101136", description: "RELE PARTIDA", unit: null, quantity: 2, unitCost: 23.29 },
    ]);
  });
  it("normalizes Brazilian monetary values and quantities", () => {
    expect(parseBrazilianNumber("1.234,56")).toBe(1234.56);
    expect(normalizeIncomingProduct({ description: "Item", quantity: "2,5", unitCost: "10,75" })).toMatchObject({ quantity: 2.5, unitCost: 10.75, code: null, unit: null });
  });
  it("rejects missing fields and unrecognized layouts", () => {
    expect(() => normalizeIncomingProduct({ quantity: 1, unitCost: 2 })).toThrow("description");
    expect(() => parseProductsFromPdfText("Documento sem itens")).toThrow("No product lines");
    expect(() => parseNfeXml("<NFe></NFe>")).toThrow("No NF-e product");
  });
});
