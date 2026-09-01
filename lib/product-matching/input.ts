import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

export function buildProductMatchInput(item: PurchaseDocumentItem): PurchaseDocumentItem {
  return {
    ...item,
    supplierCode: item.supplierCode?.trim() || null,
    supplierReference: item.supplierReference?.trim() || null,
    barcode: item.barcode?.trim() || null,
    description: item.description.trim(),
    unit: item.unit?.trim() || null,
  };
}
