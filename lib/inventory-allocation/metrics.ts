import type { DataQuality, ProductStoreMetrics } from "@/lib/inventory-allocation/types";

export type RawStoreMetrics = Omit<ProductStoreMetrics, "avgDailySales30d" | "daysOfCover" | "dataQuality">;

export function normalizeStoreMetrics(input: RawStoreMetrics): ProductStoreMetrics {
  const sales30d = finiteOrNull(input.sales30d); const stock = finiteOrNull(input.currentStock);
  const avgDailySales30d = sales30d === null ? null : sales30d / 30;
  const daysOfCover = stock === null || avgDailySales30d === null ? null : avgDailySales30d <= 0 ? null : Math.max(0, stock) / avgDailySales30d;
  return { ...input, currentStock: stock, sales7d: finiteOrNull(input.sales7d), sales30d, sales90d: finiteOrNull(input.sales90d),
    avgDailySales30d, daysOfCover, minimumStock: finiteOrNull(input.minimumStock ?? null),
    currentCost: finiteOrNull(input.currentCost), currentSalePrice: finiteOrNull(input.currentSalePrice),
    dataQuality: assessDataQuality({ ...input, currentStock: stock, sales30d }) };
}

function assessDataQuality(input: Pick<RawStoreMetrics, "currentStock" | "sales7d" | "sales30d" | "sales90d" | "lastSaleAt">): DataQuality {
  const salesWindows = [input.sales7d, input.sales30d, input.sales90d].filter((value) => finiteOrNull(value) !== null).length;
  if (input.currentStock !== null && salesWindows >= 2 && input.lastSaleAt) return "high";
  if (input.currentStock !== null && salesWindows >= 1) return "medium";
  return "low";
}
function finiteOrNull(value: number | null): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

