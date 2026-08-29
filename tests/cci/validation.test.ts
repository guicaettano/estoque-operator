import { describe, expect, it } from "vitest";
import { validateCciSyncPayload } from "@/lib/cci/validation";

const validProduct = {
  externalId: "4337",
  description: "PEDALEIRA TRAS CG/TOD/TITAN - VALCLA",
  salePrice: 11.5,
  costPrice: 6.98,
  stock: 6,
  barcode: null,
  reference: null,
  location: null,
  supplier: null,
};

describe("validateCciSyncPayload", () => {
  it("accepts a valid batch without replacing null values", () => {
    const result = validateCciSyncPayload({
      storeId: "94eae257-6fb1-4caf-822c-f88f872a7148",
      products: [validProduct],
    });
    expect(result).toEqual({
      success: true,
      data: {
        storeId: "94eae257-6fb1-4caf-822c-f88f872a7148",
        products: [{ ...validProduct, rawData: undefined }],
      },
    });
  });

  it("rejects non-finite prices and batches above 500 products", () => {
    expect(validateCciSyncPayload({
      storeId: "94eae257-6fb1-4caf-822c-f88f872a7148",
      products: [{ ...validProduct, salePrice: Number.NaN }],
    }).success).toBe(false);

    expect(validateCciSyncPayload({
      storeId: "94eae257-6fb1-4caf-822c-f88f872a7148",
      products: Array.from({ length: 501 }, () => validProduct),
    }).success).toBe(false);
  });
});
