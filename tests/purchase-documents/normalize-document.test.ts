import { describe, expect, it } from "vitest";
import { normalizeGenericPurchaseDocument } from "@/lib/purchase-documents/normalize-document";
import { parseIncomingPurchaseDocument } from "@/lib/purchase-documents/parse-document";

describe("normalized purchase documents", () => {
  it("maps generic parser products without inventing supplier data", () => {
    const document = normalizeGenericPurchaseDocument({
      source: "pdf",
      products: [{ code: null, description: "RETENTOR MOLA VALVULA", unit: "PC", quantity: 2, unitCost: 62.04 }],
    });

    expect(document).toEqual({
      source: "pdf",
      supplier: { id: "unknown", name: null },
      items: [{
        supplierCode: null,
        supplierReference: null,
        barcode: null,
        description: "RETENTOR MOLA VALVULA",
        quantity: 2,
        unitCost: 62.04,
        unit: "PC",
        total: 124.08,
      }],
    });
  });

  it("separates a commercial reference from a PDF product code only with layout evidence", () => {
    const document = normalizeGenericPurchaseDocument({
      source: "pdf",
      products: [{ code: "00089031003161", description: "CR22540M AMORTECEDOR TRASEIRO C/REGULAGEM", quantity: 2, unitCost: 79.29, unit: "PC" }],
    });
    expect(document.items[0]).toMatchObject({
      supplierCode: "00089031003161",
      supplierReference: "CR22540M",
      barcode: null,
      description: "AMORTECEDOR TRASEIRO C/REGULAGEM",
    });
  });

  it("preserves numeric commercial references and does not apply the PDF rule to XML", () => {
    const pdf = normalizeGenericPurchaseDocument({
      source: "pdf",
      products: [{ code: "00312051600139", description: "90271190 CDI MODULO IGNICAO", quantity: 1, unitCost: 36, unit: "PC" }],
    });
    const xml = normalizeGenericPurchaseDocument({
      source: "xml",
      products: [{ code: "00312051600139", description: "90271190 CDI MODULO IGNICAO", quantity: 1, unitCost: 36, unit: "PC" }],
    });
    expect(pdf.items[0]).toMatchObject({ supplierReference: "90271190", description: "CDI MODULO IGNICAO" });
    expect(xml.items[0]).toMatchObject({ supplierReference: null, description: "90271190 CDI MODULO IGNICAO" });
  });

  it("converts NF-e XML to the same normalized contract", async () => {
    const document = await parseIncomingPurchaseDocument({
      source: "xml",
      supplierName: "Fornecedor XML",
      xml: "<NFe><infNFe><det><prod><cProd>ABC1</cProd><xProd>GUIA CORRENTE COMANDO</xProd><uCom>UN</uCom><qCom>2</qCom><vUnCom>10.5</vUnCom></prod></det></infNFe></NFe>",
    });

    expect(document.source).toBe("xml");
    expect(document.supplier).toEqual({ id: "unknown", name: "Fornecedor XML" });
    expect(document.items[0]).toMatchObject({ supplierCode: "ABC1", description: "GUIA CORRENTE COMANDO", quantity: 2, unitCost: 10.5, unit: "UN" });
  });

  it("rejects normalized items without the fields required by matching", () => {
    expect(() => normalizeGenericPurchaseDocument({
      source: "pdf",
      products: [{ code: null, description: "   ", unit: null, quantity: 1, unitCost: 10 }],
    })).toThrow("descrição");
  });
});
