export const ALLOCATION_CONFIG = {
  salesHorizonDays: 30,
  salesVelocityWeight: 1,
  stockoutBoost: 1.6,
  minimumStockGapWeight: 0.4,
  missingSalesDailyFallback: 1 / 30,
  minimumScore: 0.05,
  aiMinimumDataQuality: "medium" as const,
  defaultPrecision: 0,
};

