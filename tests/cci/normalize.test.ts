import { describe, expect, it } from "vitest";
import { normalizeCciProduct } from "@/connectors/cci/src/normalize";

describe("normalizeCciProduct", () => {
  it("maps a real CCI row to the normalized product", () => {
    expect(normalizeCciProduct({
      CODIGO: 4337,
      DESCRICAO: "PEDALEIRA TRAS CG/TOD/TITAN - VALCLA",
      PRECO: "11.50",
      PRECOCOMPRA: 6.98,
      ESTOQUE: "6.000",
      CODIGOBARRAS: null,
      REFERENCIA: "PED-TITAN",
      LOCALIZACAO: null,
      FORNECEDOR: null,
    })).toMatchObject({
      externalId: "4337",
      description: "PEDALEIRA TRAS CG/TOD/TITAN - VALCLA",
      salePrice: 11.5,
      costPrice: 6.98,
      stock: 6,
      barcode: null,
      reference: "PED-TITAN",
      location: null,
      supplier: null,
    });
  });

  it("preserves null numeric and text values", () => {
    const product = normalizeCciProduct({
      CODIGO: 1,
      DESCRICAO: "Produto",
      PRECO: null,
      PRECOCOMPRA: null,
      ESTOQUE: null,
      CODIGOBARRAS: null,
      REFERENCIA: null,
      LOCALIZACAO: null,
      FORNECEDOR: null,
    });

    expect(product).toMatchObject({
      salePrice: null,
      costPrice: null,
      stock: null,
      barcode: null,
      reference: null,
      location: null,
      supplier: null,
    });
  });
});
