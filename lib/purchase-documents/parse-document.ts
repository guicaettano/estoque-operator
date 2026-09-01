import { parsePdf } from "@/lib/incoming-products/pdf-parser";
import { parseNfeXml } from "@/lib/incoming-products/xml-parser";
import { extractPurchasePdf } from "@/lib/purchase-documents/extract-pdf";
import {
  normalizeGenericPurchaseDocument,
  normalizePurchaseDocument,
  type NormalizedPurchaseDocument,
} from "@/lib/purchase-documents/normalize-document";

export async function parseIncomingPurchaseDocument(input:
  | { source: "pdf"; buffer: Buffer; filename: string; supplierName?: string | null }
  | { source: "xml"; xml: string; supplierName?: string | null }
): Promise<NormalizedPurchaseDocument> {
  if (input.source === "xml") {
    return normalizeGenericPurchaseDocument({
      source: "xml",
      products: parseNfeXml(input.xml),
      supplierName: input.supplierName,
    });
  }

  const adapted = await extractPurchasePdf(input.buffer);
  if (adapted) {
    return normalizePurchaseDocument({ source: "pdf", supplier: adapted.supplier, items: adapted.items });
  }

  return normalizeGenericPurchaseDocument({
    source: "pdf",
    products: await parsePdf(input.buffer, input.filename),
    supplierName: input.supplierName,
  });
}
