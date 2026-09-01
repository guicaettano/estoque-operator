import pdf from "pdf-parse";
import { detectPurchaseDocumentSupplier } from "@/lib/purchase-documents/detect-supplier";
import { parseOsiasDocument } from "@/lib/purchase-documents/parsers/osias";

export async function extractPurchasePdf(buffer: Buffer) {
  // The OSIAS PDF has embedded text. The default reading order keeps words
  // intact; OCR is intentionally not part of this supplier adapter.
  const text = (await pdf(buffer)).text;
  const supplier = detectPurchaseDocumentSupplier(text);
  if (supplier.id !== "osias") return null;
  return { supplier, items: parseOsiasDocument(text), text };
}
