import type { TagPlusProduct } from "@/lib/tagplus/types";

const CODE_FIELDS = ["codigo", "code", "codigo_interno"] as const;
const DESCRIPTION_FIELDS = ["descricao", "nome", "name"] as const;
const STOCK_FIELDS = ["qtd_revenda", "quantidade_estoque", "saldo_estoque", "quantidade", "estoque"] as const;

export const TAGPLUS_EDITABLE_PRODUCT_FIELDS = new Set([
  "codigo", "codigo_interno", "descricao", "nome", "unidade", "custo", "valor_custo",
  "valor_venda", "preco_venda", "valor_venda_varejo", "custo_medio", "estoque", "qtd_revenda",
  "quantidade_estoque", "saldo_estoque", "quantidade", "ativo",
]);

export function getTagPlusProductCode(product: TagPlusProduct): string | null {
  return firstTextValue(product, CODE_FIELDS);
}

export function getTagPlusProductDescription(product: TagPlusProduct): string {
  return firstTextValue(product, DESCRIPTION_FIELDS) ?? "Produto sem descrição";
}

export function getTagPlusProductStock(product: TagPlusProduct): string | null {
  const preferred = firstTextValue(product, STOCK_FIELDS);
  if (preferred !== null) return preferred;

  const nestedStock = product.estoque;
  if (nestedStock && typeof nestedStock === "object" && !Array.isArray(nestedStock)) {
    const nestedQuantity = firstTextValue(nestedStock as TagPlusProduct, ["qtd_revenda", "quantidade", "saldo"]);
    if (nestedQuantity !== null) return nestedQuantity;
  }

  for (const [field, value] of Object.entries(product)) {
    if (normalize(field).includes("estoque") && !normalize(field).includes("localizacao")) {
      const stock = textValue(value);
      if (stock !== null && stock.trim() !== "") return stock;
    }
  }
  return null;
}

export function sanitizeTagPlusProductChanges(changes: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(changes).filter(([field, value]) =>
    TAGPLUS_EDITABLE_PRODUCT_FIELDS.has(field) && (value === null || ["string", "number", "boolean"].includes(typeof value))
  ));
}

export function buildTagPlusProductUpdatePayload(changes: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...changes };
  const resaleStock = payload.qtd_revenda;

  if (typeof resaleStock === "number" && Number.isFinite(resaleStock)) {
    payload.estoque = { qtd_revenda: resaleStock };
    delete payload.qtd_revenda;
  }

  return payload;
}

export function getUnappliedTagPlusProductFields(product: TagPlusProduct, changes: Record<string, unknown>): string[] {
  return Object.entries(changes).flatMap(([field, expected]) => {
    const actual = field === "qtd_revenda" ? getTagPlusProductStock(product) : product[field];
    return equivalentValue(actual, expected) ? [] : [field];
  });
}

export function getTagPlusProductKey(product: TagPlusProduct, index: number): string {
  return textValue(product.id) ?? getTagPlusProductCode(product) ?? `produto-${index}`;
}

export function filterTagPlusProducts(products: TagPlusProduct[], query: string): TagPlusProduct[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return products;

  return products.filter((product) => {
    const code = getTagPlusProductCode(product);
    const description = getTagPlusProductDescription(product);
    return normalize(code).includes(normalizedQuery) || normalize(description).includes(normalizedQuery);
  });
}

function firstTextValue(product: TagPlusProduct, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = textValue(product[field]);
    if (value !== null && value.trim() !== "") return value;
  }
  return null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function normalize(value: string | null): string {
  return (value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function equivalentValue(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "number") {
    const actualNumber = typeof actual === "string" && actual.trim() !== "" ? Number(actual.replace(",", ".")) : actual;
    return typeof actualNumber === "number" && Number.isFinite(actualNumber) && actualNumber === expected;
  }
  return Object.is(actual, expected);
}
