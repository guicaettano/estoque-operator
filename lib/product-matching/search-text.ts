import { createHash } from "node:crypto";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";

const USEFUL_RAW_KEYS = new Set(["descricao", "description", "referencia", "reference", "codigo", "codigo_fabricante", "codigo_barras", "ean", "marca", "brand", "fabricante", "fornecedor", "supplier", "modelo", "model", "aplicacao", "application", "categoria", "category"]);

function rawValues(value: unknown, depth = 0): string[] {
  if (!value || depth > 2) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => rawValues(entry, depth + 1));
  if (typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => USEFUL_RAW_KEYS.has(key.toLowerCase()) ? rawValues(entry, depth + 1) : []);
}

export function buildProductSearchText(product: { description: string; reference?: string | null; supplier?: string | null; barcode?: string | null; rawData?: unknown }): string {
  return normalizeProductDescription([product.description, product.reference, product.supplier, product.barcode, ...rawValues(product.rawData)].filter(Boolean).join(" "));
}

export function hashProductSearchText(searchText: string): string {
  return createHash("sha256").update(searchText, "utf8").digest("hex");
}
