import { describe, expect, it } from "vitest";
import { buildTagPlusProductUpdatePayload, filterTagPlusProducts, getTagPlusProductCode, getTagPlusProductDescription, getTagPlusProductStock, getUnappliedTagPlusProductFields, sanitizeTagPlusProductChanges } from "@/lib/tagplus/products";

const products = [
  { id: 1, codigo: "AB-100", descricao: "Filtro de Óleo", estoque: 4 },
  { id: 2, codigo_interno: 220, nome: "Pastilha de freio", estoque: 8 },
];

describe("TagPlus product helpers", () => {
  it("reads the product aliases without discarding raw fields", () => {
    expect(getTagPlusProductCode(products[1])).toBe("220");
    expect(getTagPlusProductDescription(products[1])).toBe("Pastilha de freio");
    expect(getTagPlusProductStock(products[1])).toBe("8");
    expect(products[1]).toHaveProperty("estoque", 8);
  });

  it("uses the resale stock instead of interpreting an empty stock location as zero", () => {
    const product = { codigo: "5073", estoque: { qtd_revenda: 32 }, localizacao_estoque: "", qtd_revenda: 32 };
    expect(getTagPlusProductStock(product)).toBe("32");
  });

  it("searches by code or description ignoring case and accents", () => {
    expect(filterTagPlusProducts(products, "ab-100")).toEqual([products[0]]);
    expect(filterTagPlusProducts(products, "oleo")).toEqual([products[0]]);
    expect(filterTagPlusProducts(products, "PASTILHA")).toEqual([products[1]]);
  });

  it("returns every product for an empty search", () => {
    expect(filterTagPlusProducts(products, "  ")).toBe(products);
  });

  it("allows only known scalar fields to be updated", () => {
    expect(sanitizeTagPlusProductChanges({ descricao: "Novo nome", qtd_revenda: 12, ativo: true, id: 99, imagens: [{ id: 1 }] })).toEqual({ descricao: "Novo nome", qtd_revenda: 12, ativo: true });
  });

  it("sends resale stock inside the estoque object required by TagPlus", () => {
    expect(buildTagPlusProductUpdatePayload({ descricao: "Novo nome", qtd_revenda: 33 })).toEqual({
      descricao: "Novo nome",
      estoque: { qtd_revenda: 33 },
    });
  });

  it("only confirms changes that were persisted by TagPlus", () => {
    const product = { descricao: "Óleo", qtd_revenda: 32, estoque: { qtd_revenda: 32 } };
    expect(getUnappliedTagPlusProductFields(product, { descricao: "Óleo", qtd_revenda: 33 })).toEqual(["qtd_revenda"]);
    expect(getUnappliedTagPlusProductFields({ ...product, qtd_revenda: 33, estoque: { qtd_revenda: 33 } }, { qtd_revenda: 33 })).toEqual([]);
  });
});
