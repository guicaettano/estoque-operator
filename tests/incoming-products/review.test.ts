import { describe, expect, it } from "vitest";
import { calculateProfitPercent, calculateSalePrice, confirmProductReview, createProductReview, distributionMatchesQuantity, effectiveSalePrice, isProductReviewValid, splitDistributionEvenly } from "@/lib/incoming-products/review";

const incoming = { code: "A1", description: "Anel Escape", unit: "UND", quantity: 5, unitCost: 4.25 };

describe("incoming product review", () => {
  it("calculates sale price from cost and profit percentage", () => {
    expect(calculateSalePrice(4.25, 50)).toBe(6.38);
    expect(calculateSalePrice(6.63, 30)).toBe(8.62);
    expect(calculateSalePrice(4.25, null)).toBeNull();
  });

  it("allows the calculated sale price to be overridden", () => {
    const review = { ...createProductReview(incoming), profitPercent: 50 };
    expect(effectiveSalePrice(review)).toBe(6.38);
    expect(effectiveSalePrice({ ...review, salePriceOverride: 7 })).toBe(7);
  });

  it("calculates profit percentage from an edited sale price", () => {
    expect(calculateProfitPercent(4.25, 6.38)).toBe(50.12);
    expect(calculateProfitPercent(10, 15)).toBe(50);
    expect(calculateProfitPercent(0, 15)).toBeNull();
  });

  it("splits the purchased quantity equally without changing the total", () => {
    expect(splitDistributionEvenly(10)).toEqual({ rrMotos: 5, rrAutopecas: 5 });
    expect(splitDistributionEvenly(5)).toEqual({ rrMotos: 2.5, rrAutopecas: 2.5 });
  });

  it("accepts only a distribution equal to the purchased quantity", () => {
    const review = { ...createProductReview(incoming), profitPercent: 50, rrMotosQuantity: 2, rrAutopecasQuantity: 3 };
    expect(distributionMatchesQuantity(review)).toBe(true);
    expect(isProductReviewValid(review)).toBe(true);
    expect(distributionMatchesQuantity({ ...review, rrAutopecasQuantity: 2 })).toBe(false);
    expect(distributionMatchesQuantity({ ...review, rrMotosQuantity: -1, rrAutopecasQuantity: 6 })).toBe(false);
  });

  it("produces a clean confirmed structure", () => {
    expect(confirmProductReview({ ...createProductReview(incoming), profitPercent: 50, rrMotosQuantity: 2, rrAutopecasQuantity: 3 })).toEqual({
      ...incoming,
      profitPercent: 50,
      salePrice: 6.38,
      distribution: { rrMotos: 2, rrAutopecas: 3 },
    });
  });

  it("uses the manually edited sale price when confirming", () => {
    const review = { ...createProductReview(incoming), profitPercent: 50, salePriceOverride: 7, rrMotosQuantity: 2, rrAutopecasQuantity: 3 };
    expect(confirmProductReview(review).salePrice).toBe(7);
  });
});
