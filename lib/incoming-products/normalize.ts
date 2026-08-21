import { IncomingProductParseError, type IncomingProduct } from "@/lib/incoming-products/types";

type IncomingProductCandidate = Omit<Partial<IncomingProduct>, "quantity" | "unitCost"> & {
  quantity?: string | number;
  unitCost?: string | number;
};

export function parseBrazilianNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return null;
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeIncomingProduct(product: IncomingProductCandidate): IncomingProduct {
  const description = product.description?.trim();
  const quantity = parseBrazilianNumber(product.quantity);
  const unitCost = parseBrazilianNumber(product.unitCost);
  if (!description) throw new IncomingProductParseError("Product description is required");
  if (quantity === null || quantity <= 0) throw new IncomingProductParseError("Product quantity must be greater than zero");
  if (unitCost === null || unitCost < 0) throw new IncomingProductParseError("Product unit cost must be zero or greater");
  return {
    code: product.code?.trim() || null,
    description,
    unit: product.unit?.trim() || null,
    quantity,
    unitCost,
  };
}
