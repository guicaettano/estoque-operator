import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeStoreMetrics } from "@/lib/inventory-allocation/metrics";
import { suggestAllocation } from "@/lib/inventory-allocation/service";

const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

function stores() {
  return [
    normalizeStoreMetrics({ storeId: "cci", storeName: "R&R MOTOS", provider: "cci", productId: "1", externalId: "1", productDescription: "Produto", currentStock: 8, sales7d: null, sales30d: 4, sales90d: null, lastSaleAt: null, currentCost: 10, currentSalePrice: 20, eligible: true }),
    normalizeStoreMetrics({ storeId: "tag", storeName: "R&R AUTOPEÇAS", provider: "tagplus", productId: "2", externalId: "2", productDescription: "Produto", currentStock: 1, sales7d: null, sales30d: 15, sales90d: null, lastSaleAt: null, currentCost: 10, currentSalePrice: 20, eligible: true }),
  ];
}

function responseFor(value: unknown) {
  return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("validação e fallback da sugestão de IA", () => {
  it("aceita payload válido com lojas conhecidas e soma exata", async () => {
    process.env.OPENAI_API_KEY = "test-only";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(responseFor({ allocations: [
      { storeId: "cci", quantity: 3, reason: "Cobertura maior.", confidence: 0.8 },
      { storeId: "tag", quantity: 7, reason: "Maior risco de ruptura.", confidence: 0.9 },
    ], explanation: "Prioridade para a loja com maior giro." }));
    const result = await suggestAllocation({ incomingQuantity: 10, stores: stores(), newCost: 12, useAi: true });
    expect(result.method).toBe("ai");
    expect(result.allocations.map((item) => item.allocatedQuantity)).toEqual([3, 7]);
  });

  it("descarta payload inválido e retorna ao baseline determinístico", async () => {
    process.env.OPENAI_API_KEY = "test-only";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(responseFor({ allocations: [
      { storeId: "loja-inventada", quantity: 10, reason: "Inválido.", confidence: 1 },
    ], explanation: "Inválida." }));
    const result = await suggestAllocation({ incomingQuantity: 10, stores: stores(), newCost: 12, useAi: true });
    expect(result.method).toBe("deterministic");
    expect(result.fallbackReason).toMatch(/loja desconhecida|soma distribuída/i);
    expect(result.allocations.reduce((sum, item) => sum + item.allocatedQuantity, 0)).toBe(10);
  });
});

