import type { ErpProductRecord, ReferenceMatchSource } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

export function normalizeProductReference(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

export function productReferenceQueries(item: PurchaseDocumentItem): string[] {
  return [...new Set([item.supplierReference, item.barcode, item.supplierCode]
    .map(normalizeProductReference)
    .filter((value) => value.length >= 3))];
}

export function nearReferenceLookupTerms(reference: string): string[] {
  const normalized = normalizeProductReference(reference);
  if (normalized.length < 6) return [];
  const suffix = normalized.match(/^[A-Z]+0*([0-9][A-Z0-9]{2,})$/)?.[1] ?? null;
  return [...new Set([normalized.slice(0, Math.max(6, normalized.length - 2)), suffix].filter((value): value is string => Boolean(value)))];
}

function containsReferenceToken(value: string | null | undefined, reference: string): boolean {
  if (!value || !reference) return false;
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .some((token) => token === reference);
}

export function evaluateProductReferenceMatch(item: PurchaseDocumentItem, product: ErpProductRecord): {
  exact: boolean;
  near: boolean;
  source: ReferenceMatchSource;
  normalizedSupplierCode: string | null;
} {
  const references = productReferenceQueries(item);
  const fragments = references.flatMap((reference) => nearReferenceLookupTerms(reference).filter((value) => value.length >= 3));
  const fields: Array<[Exclude<ReferenceMatchSource, null>, string | null | undefined]> = [
    ["reference", product.reference],
    ["barcode", product.barcode],
    ["search_text", product.searchText],
    ["description", product.description],
  ];

  for (const reference of references) {
    for (const [source, value] of fields) {
      if (normalizeProductReference(value) === reference || containsReferenceToken(value, reference)) {
        return { exact: true, near: false, source, normalizedSupplierCode: reference };
      }
    }
  }

  for (const fragment of fragments) {
    for (const [source, value] of fields) {
      if (containsReferenceToken(value, fragment) || normalizeProductReference(value) === fragment) {
        return { exact: false, near: true, source, normalizedSupplierCode: references[0] ?? fragment };
      }
    }
  }

  for (const reference of references) {
    if (reference.length < 4) continue;
    for (const [source, value] of fields) {
      const normalizedValue = normalizeProductReference(value);
      if (normalizedValue.includes(reference) || reference.includes(normalizedValue) && normalizedValue.length >= 4) {
        return { exact: false, near: true, source, normalizedSupplierCode: reference };
      }
    }
  }

  return { exact: false, near: false, source: null, normalizedSupplierCode: references[0] ?? null };
}
