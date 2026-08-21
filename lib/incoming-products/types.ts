export type IncomingDocumentStatus = "uploaded" | "processing" | "review" | "confirmed" | "error";

export type IncomingProduct = {
  code: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unitCost: number;
};

export type ReviewedIncomingProduct = IncomingProduct & {
  profitPercent: number | null;
  salePriceOverride: number | null;
  rrMotosQuantity: number | null;
  rrAutopecasQuantity: number | null;
};

export type ConfirmedIncomingProduct = IncomingProduct & {
  profitPercent: number;
  salePrice: number;
  distribution: {
    rrMotos: number;
    rrAutopecas: number;
  };
};

export class IncomingProductParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncomingProductParseError";
  }
}
