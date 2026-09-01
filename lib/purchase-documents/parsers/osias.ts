import { parseBrazilianNumber } from "@/lib/incoming-products/normalize";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

const PRODUCT_CODE = /^(\d{4,6})(?![\d-])(.*)$/;
const UNIT_PRICE = /^\d{1,3}(?:\.\d{3})*,\d{3}$/;
const TOTAL_PRICE = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const REFERENCE = /(?:^|\s)([A-Z0-9][A-Z0-9./-]*-(?:UND?|UN|PC|PÇ|KG|LT|CX|KIT))\s*$/i;

export class OsiasParseError extends Error {
  constructor(message: string) { super(message); this.name = "OsiasParseError"; }
}

function compact(value: string): string { return value.replace(/\s+/g, " ").trim(); }

function number(value: string, field: string): number {
  const parsed = parseBrazilianNumber(value);
  if (parsed === null) throw new OsiasParseError(`Valor brasileiro inválido em ${field}: ${value}`);
  return parsed;
}

function splitValues(content: string) {
  const numericTail = content.match(/(\d[\d.,]*)\s*$/);
  if (!numericTail || numericTail.index === undefined) return null;
  const compactValues = numericTail[1];
  for (let quantityLength = 1; quantityLength <= Math.min(3, compactValues.length - 12); quantityLength += 1) {
    const quantityText = compactValues.slice(0, quantityLength);
    if (!/^\d+$/.test(quantityText)) continue;
    for (let priceLength = 5; priceLength <= 12; priceLength += 1) {
      const firstPrice = compactValues.slice(quantityLength, quantityLength + priceLength);
      const secondPrice = compactValues.slice(quantityLength + priceLength, quantityLength + (priceLength * 2));
      const totalText = compactValues.slice(quantityLength + (priceLength * 2));
      if (firstPrice !== secondPrice || !UNIT_PRICE.test(firstPrice) || !TOTAL_PRICE.test(totalText)) continue;
      const quantity = number(quantityText, "quantidade");
      const unitCost = number(firstPrice, "custo unitário");
      const total = number(totalText, "total");
      if (Math.abs(quantity * unitCost - total) <= 0.011) {
        return { prefix: content.slice(0, numericTail.index).trim(), quantity, unitCost, total };
      }
    }
  }
  return null;
}

function parseSegment(lines: string[]): PurchaseDocumentItem | null {
  const first = lines[0].match(PRODUCT_CODE);
  if (!first) return null;
  const supplierCode = first[1];
  const rawText = lines.join("\n");
  let content = compact([first[2], ...lines.slice(1)].join(" "));
  const values = splitValues(content);
  if (!values) return null;
  content = values.prefix.replace(/([A-Z0-9./-]+-)\s+(UND?|UN|PC|PÇ|KG|LT|CX|KIT)\s*$/i, "$1$2");
  const reference = content.match(REFERENCE);
  const supplierReference = reference?.[1] ?? null;
  if (reference) content = content.slice(0, reference.index).trim();
  if (!content || values.quantity <= 0 || values.unitCost < 0 || values.total < 0) return null;
  return { supplierCode, supplierReference, description: content, quantity: values.quantity, unitCost: values.unitCost, total: values.total, rawText };
}

export function parseOsiasDocument(text: string): PurchaseDocumentItem[] {
  const tableStart = text.search(/C[óo]digoDescri[çc][ãa]o dos Produtos/i);
  if (tableStart < 0) throw new OsiasParseError("A tabela de produtos do pedido OSIAS não foi encontrada.");
  const table = text.slice(tableStart).split(/\r?\n/);
  const segments: string[][] = [];
  let current: string[] | null = null;
  for (const rawLine of table) {
    const line = rawLine.trim();
    if (/^=|^Totais\s*==>/i.test(line)) break;
    if (!line) continue;
    if (PRODUCT_CODE.test(line)) {
      if (current) segments.push(current);
      current = [line];
    } else if (current) current.push(line);
  }
  if (current) segments.push(current);
  const items = segments.map(parseSegment).filter((item): item is PurchaseDocumentItem => item !== null);
  if (!items.length) throw new OsiasParseError("Nenhum item foi identificado no pedido OSIAS.");
  return items;
}
