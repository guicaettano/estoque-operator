import type { DetectedSupplier } from "@/lib/purchase-documents/types";

export function detectPurchaseDocumentSupplier(text: string): DetectedSupplier {
  if (/OSIAS\s+MOT\s*O\s+PE(?:C|Ç)AS/i.test(text)) {
    return { id: "osias", name: "OSIAS MOTO PECAS" };
  }
  return { id: "unknown", name: null };
}
