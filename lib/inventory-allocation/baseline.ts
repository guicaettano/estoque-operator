import { ALLOCATION_CONFIG } from "@/lib/inventory-allocation/config";
import type { AllocationSuggestion, NecessityLevel, ProductStoreMetrics, StoreAllocation } from "@/lib/inventory-allocation/types";

export function buildDeterministicAllocation(input: { incomingQuantity: number; stores: ProductStoreMetrics[]; newCost: number | null; precision?: number }): AllocationSuggestion {
  const precision = input.precision ?? ALLOCATION_CONFIG.defaultPrecision; const eligible = input.stores.filter((store) => store.eligible);
  if (!Number.isFinite(input.incomingQuantity) || input.incomingQuantity <= 0) throw new Error("A quantidade recebida deve ser positiva.");
  if (!eligible.length) throw new Error("Nenhuma loja está elegível para receber o produto.");
  const scored = eligible.map((store) => ({ store, score: necessityScore(store) }));
  const quantities = distribute(input.incomingQuantity, scored.map(({ score }) => score), precision);
  const byId = new Map(scored.map(({ store, score }, index) => [store.storeId, { score, quantity: quantities[index] }]));
  const allocations: StoreAllocation[] = input.stores.map((store) => {
    const result = byId.get(store.storeId); const quantity = result?.quantity ?? 0; const score = result?.score ?? 0;
    return { ...store, minimumStock: store.minimumStock ?? null, suggestedQuantity: quantity, allocatedQuantity: quantity,
      predictedStock: store.currentStock === null ? null : store.currentStock + quantity,
      newCost: input.newCost, newSalePrice: store.currentSalePrice, allocationMethod: "deterministic",
      necessityScore: round(score, 4), necessityLevel: necessityLevel(score), reason: deterministicReason(store),
      confidence: store.dataQuality === "high" ? 0.86 : store.dataQuality === "medium" ? 0.7 : 0.45,
      requiresProductCreation: !store.productId };
  });
  return { incomingQuantity: input.incomingQuantity, precision, method: "deterministic", allocations,
    explanation: eligible.length === 1 ? "A única loja elegível recebe toda a quantidade."
      : "Distribuição proporcional à necessidade relativa, considerando giro disponível, estoque e risco de ruptura.",
    aiCalled: false, fallbackReason: null };
}

export function necessityScore(store: ProductStoreMetrics): number {
  const stock = Math.max(0, store.currentStock ?? 0);
  const dailySales = store.avgDailySales30d ?? (store.sales7d === null ? null : store.sales7d / 7)
    ?? (store.sales90d === null ? null : store.sales90d / 90) ?? ALLOCATION_CONFIG.missingSalesDailyFallback;
  let score = Math.sqrt(Math.max(0, dailySales * ALLOCATION_CONFIG.salesHorizonDays) / (stock + 1)) * ALLOCATION_CONFIG.salesVelocityWeight;
  if (stock === 0) score *= ALLOCATION_CONFIG.stockoutBoost;
  const minimum = store.minimumStock ?? null;
  if (minimum !== null && minimum > 0 && stock < minimum) score += ((minimum - stock) / minimum) * ALLOCATION_CONFIG.minimumStockGapWeight;
  return Math.max(ALLOCATION_CONFIG.minimumScore, score);
}

function distribute(total: number, scores: number[], precision: number): number[] {
  const factor = 10 ** precision; const units = Math.round(total * factor); const scoreTotal = scores.reduce((sum, score) => sum + score, 0);
  const raw = scores.map((score) => units * score / scoreTotal); const result = raw.map(Math.floor);
  const remaining = units - result.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) result[order[index % order.length].index] += 1;
  return result.map((value) => value / factor);
}

function deterministicReason(store: ProductStoreMetrics): string {
  if (store.dataQuality === "low") return "Estimativa conservadora baseada no estoque; histórico de vendas indisponível.";
  if (store.currentStock === 0) return "Prioridade elevada por estoque zerado e giro recente.";
  if (store.minimumStock !== null && store.minimumStock !== undefined && (store.currentStock ?? 0) < store.minimumStock) return "Estoque atual abaixo do mínimo configurado.";
  if (store.daysOfCover !== null) return `Cobertura estimada de ${round(store.daysOfCover, 1)} dias.`;
  return "Necessidade calculada com os dados operacionais disponíveis.";
}
function necessityLevel(score: number): NecessityLevel { if (score >= 2) return "critical"; if (score >= 1) return "high"; if (score >= 0.4) return "medium"; return "low"; }
function round(value: number, precision: number) { return Math.round(value * 10 ** precision) / 10 ** precision; }
