import { describe, expect, it, vi } from "vitest";
import { buildDeterministicAllocation } from "@/lib/inventory-allocation/baseline";
import { normalizeStoreMetrics, type RawStoreMetrics } from "@/lib/inventory-allocation/metrics";
import { buildInventoryUpdatePlan } from "@/lib/inventory-allocation/plan";
import { suggestAllocation } from "@/lib/inventory-allocation/service";
import type { ProductStoreMetrics } from "@/lib/inventory-allocation/types";
import { validateAllocationSuggestion } from "@/lib/inventory-allocation/validation";

function store(overrides: Partial<RawStoreMetrics> & Pick<RawStoreMetrics, "storeId" | "storeName" | "provider">): ProductStoreMetrics {
  return normalizeStoreMetrics({
    productId: "product-1", externalId: "10", productDescription: "Produto", currentStock: 5,
    sales7d: null, sales30d: null, sales90d: null, lastSaleAt: null,
    currentCost: 10, currentSalePrice: 20, eligible: true, ...overrides,
  });
}

describe("distribuição inteligente entre lojas", () => {
  it("normaliza métricas sem inventar giro ausente", () => {
    const metrics = store({ storeId: "cci", storeName: "R&R MOTOS", provider: "cci", currentStock: 8 });
    expect(metrics.avgDailySales30d).toBeNull();
    expect(metrics.daysOfCover).toBeNull();
    expect(metrics.dataQuality).toBe("low");
  });

  it("produz o cenário conceitual 2 + 8 e preserva exatamente o total", () => {
    const stores = [
      store({ storeId: "cci", storeName: "R&R MOTOS", provider: "cci", currentStock: 8, sales30d: 4 }),
      store({ storeId: "tag", storeName: "R&R AUTOPEÇAS", provider: "tagplus", currentStock: 1, sales30d: 15 }),
    ];
    const suggestion = buildDeterministicAllocation({ incomingQuantity: 10, stores, newCost: 12 });
    expect(suggestion.allocations.map(({ allocatedQuantity }) => allocatedQuantity)).toEqual([2, 8]);
    expect(suggestion.allocations.reduce((sum, item) => sum + item.allocatedQuantity, 0)).toBe(10);
    expect(suggestion.allocations.map(({ predictedStock }) => predictedStock)).toEqual([10, 9]);
  });

  it("envia tudo para a única loja elegível sem chamar IA", async () => {
    const stores = [
      store({ storeId: "cci", storeName: "R&R MOTOS", provider: "cci" }),
      store({ storeId: "tag", storeName: "R&R AUTOPEÇAS", provider: "tagplus", eligible: false }),
    ];
    const suggestion = await suggestAllocation({ incomingQuantity: 7, stores, newCost: 12, useAi: true });
    expect(suggestion.allocations.map(({ allocatedQuantity }) => allocatedQuantity)).toEqual([7, 0]);
    expect(suggestion.aiCalled).toBe(false);
    expect(suggestion.fallbackReason).toMatch(/somente uma loja/i);
  });

  it("não chama IA quando os dados operacionais são insuficientes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const stores = [
      store({ storeId: "cci", storeName: "R&R MOTOS", provider: "cci" }),
      store({ storeId: "tag", storeName: "R&R AUTOPEÇAS", provider: "tagplus", currentStock: 1 }),
    ];
    const suggestion = await suggestAllocation({ incomingQuantity: 5, stores, newCost: 12, useAi: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(suggestion.fallbackReason).toMatch(/histórico de vendas insuficiente/i);
    fetchSpy.mockRestore();
  });

  it("rejeita loja desconhecida, quantidade negativa e soma incorreta", () => {
    const stores = [store({ storeId: "cci", storeName: "R&R MOTOS", provider: "cci" })];
    const suggestion = buildDeterministicAllocation({ incomingQuantity: 5, stores, newCost: 12 });
    suggestion.allocations[0] = { ...suggestion.allocations[0], storeId: "intrusa", allocatedQuantity: -1 };
    const errors = validateAllocationSuggestion(suggestion, stores);
    expect(errors.join(" ")).toMatch(/desconhecida/i);
    expect(errors.join(" ")).toMatch(/quantidade inválida/i);
    expect(errors.join(" ")).toMatch(/soma distribuída/i);
  });

  it("gera plano usando a quantidade humana editada e mede aceitação", () => {
    const stores = [store({ storeId: "cci", storeName: "R&R MOTOS", provider: "cci" })];
    const suggestion = buildDeterministicAllocation({ incomingQuantity: 5, stores, newCost: 12 });
    const accepted = buildInventoryUpdatePlan({ supplierCode: "ABC", incomingDescription: "Produto", suggestion });
    expect(accepted.acceptedSuggestion).toBe(true);
    suggestion.allocations[0].suggestedQuantity = 4;
    const edited = buildInventoryUpdatePlan({ supplierCode: "ABC", incomingDescription: "Produto", suggestion });
    expect(edited.acceptedSuggestion).toBe(false);
  });
});

