import { IncomingProductParseError, type IncomingProduct } from "@/lib/incoming-products/types";
import type { DetectedSupplier, PurchaseDocumentItem } from "@/lib/purchase-documents/types";

export type PurchaseDocumentSource = "pdf" | "xml";

export type NormalizedPurchaseDocument = {
  source: PurchaseDocumentSource;
  supplier: DetectedSupplier;
  items: PurchaseDocumentItem[];
};

export function normalizeGenericPurchaseDocument(input: {
  source: PurchaseDocumentSource;
  products: IncomingProduct[];
  supplierName?: string | null;
}): NormalizedPurchaseDocument {
  const supplierName = input.supplierName?.trim() || null;
  return normalizePurchaseDocument({
    source: input.source,
    supplier: { id: "unknown", name: supplierName },
    items: input.products.map((product) => {
      const classified = input.source === "pdf"
        ? classifyPdfProductIdentity(product.code, product.description)
        : { supplierReference: null, description: product.description };
      return {
      supplierCode: product.code,
      supplierReference: classified.supplierReference,
      barcode: null,
      description: classified.description,
      quantity: product.quantity,
      unitCost: product.unitCost,
      unit: product.unit,
      total: product.quantity * product.unitCost,
    }; }),
  });
}

const DOCUMENT_PRODUCT_CODE = /^\d{13,14}$/;
const LEADING_COMMERCIAL_REFERENCE = /^(?<reference>[A-Z0-9]{4,16})\s+(?<description>.+)$/i;

export function classifyPdfProductIdentity(code: string | null, description: string) {
  const match = description.trim().match(LEADING_COMMERCIAL_REFERENCE)?.groups;
  if (!code || !DOCUMENT_PRODUCT_CODE.test(code) || !match || match.reference === code || !/[A-ZÀ-Ü]/i.test(match.description)) {
    return { supplierReference: null, description };
  }
  return { supplierReference: match.reference, description: match.description };
}

export function normalizePurchaseDocument(document: NormalizedPurchaseDocument): NormalizedPurchaseDocument {
  if (!document.items.length) {
    throw new IncomingProductParseError("Nenhum item foi identificado no documento.");
  }

  const items = document.items.map((item, index) => {
    const description = item.description.trim();
    if (!description) {
      throw new IncomingProductParseError(`O item ${index + 1} não possui descrição.`);
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new IncomingProductParseError(`O item ${index + 1} não possui quantidade válida.`);
    }
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
      throw new IncomingProductParseError(`O item ${index + 1} não possui custo unitário válido.`);
    }

    return {
      ...item,
      supplierCode: item.supplierCode?.trim() || null,
      supplierReference: item.supplierReference?.trim() || null,
      barcode: item.barcode?.trim() || null,
      description,
      unit: item.unit?.trim() || null,
    };
  });

  return { ...document, items };
}
