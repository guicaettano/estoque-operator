import type { ConfirmedIncomingProduct, IncomingProduct, ReviewedIncomingProduct } from "@/lib/incoming-products/types";

const EPSILON = 0.000001;

export function createProductReview(product: IncomingProduct): ReviewedIncomingProduct {
  return { ...product, profitPercent: null, salePriceOverride: null, rrMotosQuantity: null, rrAutopecasQuantity: null };
}

export function calculateSalePrice(unitCost: number, profitPercent: number | null): number | null {
  if (profitPercent === null || !Number.isFinite(profitPercent) || profitPercent < 0) return null;
  return Math.round((unitCost * (1 + profitPercent / 100) + Number.EPSILON) * 100) / 100;
}

export function calculateProfitPercent(unitCost: number, salePrice: number): number | null {
  if (!Number.isFinite(unitCost) || unitCost <= 0 || !Number.isFinite(salePrice) || salePrice < 0) return null;
  return Math.round((((salePrice / unitCost) - 1) * 100 + Number.EPSILON) * 100) / 100;
}

export function effectiveSalePrice(product: ReviewedIncomingProduct): number | null {
  if (product.salePriceOverride !== null) {
    return Number.isFinite(product.salePriceOverride) && product.salePriceOverride >= 0 ? product.salePriceOverride : null;
  }
  return calculateSalePrice(product.unitCost, product.profitPercent);
}

export function splitDistributionEvenly(quantity: number): { rrMotos: number; rrAutopecas: number } {
  const rrMotos = quantity / 2;
  return { rrMotos, rrAutopecas: quantity - rrMotos };
}

export function distributionMatchesQuantity(product: ReviewedIncomingProduct): boolean {
  const { rrMotosQuantity, rrAutopecasQuantity } = product;
  if (rrMotosQuantity === null || rrAutopecasQuantity === null || rrMotosQuantity < 0 || rrAutopecasQuantity < 0) return false;
  return Math.abs(rrMotosQuantity + rrAutopecasQuantity - product.quantity) < EPSILON;
}

export function isProductReviewValid(product: ReviewedIncomingProduct): boolean {
  return product.profitPercent !== null && product.profitPercent >= 0 && effectiveSalePrice(product) !== null && distributionMatchesQuantity(product);
}

export function confirmProductReview(product: ReviewedIncomingProduct): ConfirmedIncomingProduct {
  const salePrice = effectiveSalePrice(product);
  if (salePrice === null || product.profitPercent === null || !distributionMatchesQuantity(product) || product.rrMotosQuantity === null || product.rrAutopecasQuantity === null) {
    throw new Error("Product review is incomplete or has an invalid distribution");
  }
  return {
    code: product.code,
    description: product.description,
    unit: product.unit,
    quantity: product.quantity,
    unitCost: product.unitCost,
    profitPercent: product.profitPercent,
    salePrice,
    distribution: { rrMotos: product.rrMotosQuantity, rrAutopecas: product.rrAutopecasQuantity },
  };
}
