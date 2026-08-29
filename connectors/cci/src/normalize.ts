import type { CciProductRow, NormalizedCciProduct } from "./types";

export function normalizeCciProduct(row: CciProductRow): NormalizedCciProduct {
  return {
    externalId: requiredText(row.CODIGO, "CODIGO"),
    description: requiredText(row.DESCRICAO, "DESCRICAO"),
    salePrice: nullableNumber(row.PRECO, "PRECO"),
    costPrice: nullableNumber(row.PRECOCOMPRA, "PRECOCOMPRA"),
    stock: nullableNumber(row.ESTOQUE, "ESTOQUE"),
    barcode: nullableText(row.CODIGOBARRAS),
    reference: nullableText(row.REFERENCIA),
    location: nullableText(row.LOCALIZACAO),
    supplier: nullableText(row.FORNECEDOR),
    rawData: { ...row },
  };
}

function requiredText(value: unknown, field: string): string {
  if (value === null || value === undefined) throw new Error(`${field} não pode ser null.`);
  const text = String(value).trim();
  if (!text) throw new Error(`${field} não pode ser vazio.`);
  return text;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value).trim();
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(number)) throw new Error(`${field} contém um número inválido.`);
  return number;
}
