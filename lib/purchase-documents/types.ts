export type PurchaseDocumentItem = {
  supplierCode: string | null;
  supplierReference: string | null;
  barcode?: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  unit?: string | null;
  total: number | null;
  rawText?: string;
};

export type DetectedSupplier = {
  id: "osias" | "unknown";
  name: string | null;
};
