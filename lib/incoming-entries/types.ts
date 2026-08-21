import type { ConfirmedIncomingProduct, ReviewedIncomingProduct } from "@/lib/incoming-products/types";

export type IncomingEntryStatus = "review" | "confirmed" | "error";
export type IncomingEntryItemAction = "matched" | "created";

export type ConfirmIncomingEntryInput = {
  userId: string;
  supplierName?: string | null;
  sourceFilename: string;
  source: "pdf" | "xml";
  products: ReviewedIncomingProduct[];
};

export type PersistedIncomingEntry = {
  id: string;
  status: IncomingEntryStatus;
  confirmedAt: string;
  items: Array<{
    id: string;
    matchedProductId: string;
    action: IncomingEntryItemAction;
    product: ConfirmedIncomingProduct;
  }>;
};
