import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeterministicAllocation, necessityScore } from "@/lib/inventory-allocation/baseline";
import { normalizeStoreMetrics } from "@/lib/inventory-allocation/metrics";
import { suggestAllocation } from "@/lib/inventory-allocation/service";

const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => { vi.restoreAllMocks(); if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; });

function store(id: string, stock: number, sales30d: number | null) {
  return normalizeStoreMetrics({ storeId: id, storeName: id, provider: id === "cci" ? "cci" : "tagplus", productId: id, externalId: id,
    productDescription: "Produto", currentStock: stock, sales7d: null, sales30d, sales90d: null, minimumStock: null,
    lastSaleAt: null, currentCost: 1, currentSalePrice: 2, eligible: true });
}
function aiResponse(allocations: unknown[]) { return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ allocations, explanation: "Teste" }) }] }] }), { status: 200 }); }

describe("casos extremos da distribuição", () => {
  it("calcula cobertura e prioriza maior giro", () => {
    const slow = store("cci", 8, 4); const fast = store("tag", 1, 15);
    expect(slow.daysOfCover).toBe(60);
    expect(necessityScore(fast)).toBeGreaterThan(necessityScore(slow));
  });

  it("estoque zero aumenta a necessidade", () => {
    expect(necessityScore(store("tag", 0, 3))).toBeGreaterThan(necessityScore(store("cci", 5, 3)));
  });

  it.each([
    ["soma incorreta", [{ storeId: "cci", quantity: 3, reason: "x", confidence: 0.8 }, { storeId: "tag", quantity: 9, reason: "y", confidence: 0.8 }]],
    ["quantidade negativa", [{ storeId: "cci", quantity: -1, reason: "x", confidence: 0.8 }, { storeId: "tag", quantity: 11, reason: "y", confidence: 0.8 }]],
  ])("usa baseline quando a IA retorna %s", async (_label, allocations) => {
    process.env.OPENAI_API_KEY = "test-only"; vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse(allocations));
    const result = await suggestAllocation({ incomingQuantity: 10, stores: [store("cci", 8, 4), store("tag", 1, 15)], newCost: 2, useAi: true });
    expect(result.method).toBe("deterministic"); expect(result.allocations.reduce((sum, item) => sum + item.allocatedQuantity, 0)).toBe(10);
  });

  it("usa baseline em timeout sem quebrar o fluxo", async () => {
    process.env.OPENAI_API_KEY = "test-only"; vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    const result = await suggestAllocation({ incomingQuantity: 10, stores: [store("cci", 8, 4), store("tag", 1, 15)], newCost: 2, useAi: true });
    expect(result.method).toBe("deterministic"); expect(result.fallbackReason).toContain("timeout");
  });

  it("mantém a soma com precisão decimal", () => {
    const result = buildDeterministicAllocation({ incomingQuantity: 2.5, precision: 1, stores: [store("cci", 2, null), store("tag", 3, null)], newCost: 1 });
    expect(result.allocations.reduce((sum, item) => sum + item.allocatedQuantity, 0)).toBe(2.5);
  });
});
