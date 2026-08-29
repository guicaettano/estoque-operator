export type ExternalProduct = {
  externalId: string;
  description: string;
  salePrice: number | null;
  costPrice: number | null;
  stock: number | null;
  barcode: string | null;
  reference: string | null;
  location: string | null;
  supplier: string | null;
  rawData?: Record<string, unknown> | null;
};

export type CciSyncPayload = {
  storeId: string;
  products: ExternalProduct[];
};

export type CciSyncSummary = {
  success: true;
  received: number;
  upserted: number;
  errors: number;
};
