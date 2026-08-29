import type { CciSyncPayload, ExternalProduct } from "@/lib/cci/types";

export const CCI_SYNC_BATCH_LIMIT = 500;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidationResult =
  | { success: true; data: CciSyncPayload }
  | { success: false; message: string };

export function validateCciSyncPayload(input: unknown): ValidationResult {
  if (!isRecord(input)) return invalid("Payload inválido.");
  if (!isUuid(input.storeId)) return invalid("storeId inválido.");
  if (!Array.isArray(input.products)) return invalid("products deve ser uma lista.");
  if (input.products.length > CCI_SYNC_BATCH_LIMIT) {
    return invalid(`Cada lote pode conter no máximo ${CCI_SYNC_BATCH_LIMIT} produtos.`);
  }

  const products: ExternalProduct[] = [];
  for (let index = 0; index < input.products.length; index += 1) {
    const product = validateProduct(input.products[index], index);
    if (!product.success) return product;
    products.push(product.data);
  }

  return { success: true, data: { storeId: input.storeId, products } };
}

function validateProduct(input: unknown, index: number):
  | { success: true; data: ExternalProduct }
  | { success: false; message: string } {
  const prefix = `products[${index}]`;
  if (!isRecord(input)) return invalid(`${prefix} inválido.`);
  if (!isRequiredString(input.externalId, 255)) return invalid(`${prefix}.externalId inválido.`);
  if (!isRequiredString(input.description, 1000)) return invalid(`${prefix}.description inválido.`);

  const { salePrice, costPrice, stock, barcode, reference, location, supplier } = input;
  if (!isNullableFiniteNumber(salePrice)) return invalid(`${prefix}.salePrice deve ser número ou null.`);
  if (!isNullableFiniteNumber(costPrice)) return invalid(`${prefix}.costPrice deve ser número ou null.`);
  if (!isNullableFiniteNumber(stock)) return invalid(`${prefix}.stock deve ser número ou null.`);
  if (!isNullableString(barcode, 1000)) return invalid(`${prefix}.barcode deve ser texto ou null.`);
  if (!isNullableString(reference, 1000)) return invalid(`${prefix}.reference deve ser texto ou null.`);
  if (!isNullableString(location, 1000)) return invalid(`${prefix}.location deve ser texto ou null.`);
  if (!isNullableString(supplier, 1000)) return invalid(`${prefix}.supplier deve ser texto ou null.`);

  if (input.rawData !== undefined && input.rawData !== null && !isRecord(input.rawData)) {
    return invalid(`${prefix}.rawData deve ser um objeto ou null.`);
  }

  return {
    success: true,
    data: {
      externalId: input.externalId,
      description: input.description,
      salePrice,
      costPrice,
      stock,
      barcode,
      reference,
      location,
      supplier,
      rawData: input.rawData as Record<string, unknown> | null | undefined,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRequiredString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isNullableString(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function invalid(message: string): { success: false; message: string } {
  return { success: false, message };
}
