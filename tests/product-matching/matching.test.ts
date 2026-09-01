import { afterEach, describe, expect, it, vi } from "vitest";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";
import { normalizeProductReference } from "@/lib/product-matching/reference";
import { validateRerankResult } from "@/lib/product-matching/reranker";
import { retrieveProductCandidates, type ProductRetrievalRepository } from "@/lib/product-matching/retrieval";
import { scoreProductCandidate } from "@/lib/product-matching/score";
import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { ErpProductRecord, ProductCandidateReranker } from "@/lib/product-matching/types";

const item = (description: string) => ({ supplierCode: "10", supplierReference: null, description, quantity: 1, unitCost: 10, total: 10 });
const product = (description: string, externalId = description, supplier: string | null = null): ErpProductRecord => ({ productId: externalId, externalId, description, stock: 1, costPrice: 8, salePrice: 12, barcode: null, reference: null, supplier });

afterEach(() => vi.unstubAllEnvs());

describe("product matching", () => {
  it("normalizes accents and punctuation while preserving meaningful numbers", () => {
    expect(normalizeProductDescription("  Peça, TIT 150 04 / 08  ")).toBe("PECA TIT 150 04/08");
  });

  it("normalizes structured manufacturer references without separators", () => {
    expect(normalizeProductReference("DPR8EA-9S")).toBe("DPR8EA9S");
    expect(normalizeProductReference("14611-kre-g00")).toBe("14611KREG00");
  });

  it("recognizes supplierCode as an exact reference token in search_text", () => {
    const query = { ...item("GUIA CORRENTE COMAND"), supplierCode: "14611KREG00" };
    const candidate = scoreProductCandidate(query, {
      ...product("GUIA CORR COMANDO TIT 160/BROS - HONDA 14611KREG00", "3507"),
      searchText: "GUIA CORR COMANDO TIT 160 BROS HONDA 14611KREG00 6334 DIVERSOS",
    });
    expect(candidate.scoreBreakdown).toMatchObject({
      exactReferenceMatch: true,
      nearReferenceMatch: false,
      referenceMatchSource: "search_text",
      normalizedSupplierCode: "14611KREG00",
    });
    expect(candidate.deterministicScore).toBeGreaterThanOrEqual(0.99);
  });

  it("extracts explicit structured intent without inventing fields", () => {
    expect(parseProductIntent(item("CORRENTE COMANDO SHINERAY XY-50Q 82L OSI"))).toMatchObject({
      partType: "CORRENTE COMANDO",
      vehicleModels: ["SHINERAY XY 50Q"],
      brand: "OSI",
      specifications: ["82L"],
      years: [],
      positions: [],
    });
    expect(parseProductIntent(item("CABO VELOCIMETRO TIT 2000 ES OSI"))).toMatchObject({ partType: "CABO VELOCIMETRO", vehicleModels: ["TITAN"], years: ["2000"], variants: ["ES"], brand: "OSI" });
  });

  it("treats clutch controls as one part family and rejects an explicit motor-brush conflict", () => {
    const query = item("MANICOTO EMBR FAZER/LANDER/TENERE COMETA");
    const compatible = scoreProductCandidate(query, product("MANETE EMBREAGEM FAZER 250/LANDER - COMETA"));
    const conflict = scoreProductCandidate(query, product("ESCOVA MOTOR FAZER 250 - MAGNETRON"));
    expect(compatible.parsedIntent.partType).toBe("ACIONAMENTO EMBREAGEM");
    expect(conflict.scoreBreakdown.partTypeConflict).toBe(true);
    expect(compatible.deterministicScore).toBeGreaterThan(conflict.deterministicScore);
  });

  it("ranks the real command-chain description above the bad gasket match", () => {
    const query = item("CORRENTE COMANDO SHINERAY XY-50Q 82L OSI");
    const correct = scoreProductCandidate(query, product("CORRENTE COMANDO SHINERAY 50Q 82L - OSI", "correct"));
    const bad = scoreProductCandidate(query, product("JG JUNTA MOTO SHINERAY XY 50Q - VEDAMOTORS", "bad"));
    expect(correct.deterministicScore).toBeGreaterThan(bad.deterministicScore);
    expect(bad.scoreBreakdown.partTypeConflict).toBe(true);
    expect(bad.deterministicScore).toBeLessThanOrEqual(0.18);
  });

  it.each([
    ["CABO VELOCIMETRO TIT 150", "CABO VELOCIMETRO TIT 150", "CABO EMBREAGEM TIT 150"],
    ["PASTILHA DIANT BROS 160", "PASTILHA DIANT BROS 160", "PASTILHA TRAS BROS 160"],
    ["CABO VELOCIMETRO TIT 150", "CABO VELOCIMETRO TIT 150", "CABO VELOCIMETRO TIT 160"],
    ["CHAVE LUZ TIT 2000 ES", "CHAVE LUZ TIT 2000 ES", "CHAVE LUZ TIT 2000 KS"],
    ["CANELA BENGALA TIT 150", "CANELA BENGALA TIT 150", "TUBO INTERNO BENGALA TIT 150"],
    ["CORRENTE COMANDO TIT 150", "CORRENTE COMANDO TIT 150", "KIT RELACAO TIT 150"],
  ])("penalizes clear structured conflicts in %s", (query, compatible, conflict) => {
    expect(scoreProductCandidate(item(query), product(compatible)).deterministicScore)
      .toBeGreaterThan(scoreProductCandidate(item(query), product(conflict)).deterministicScore);
  });

  it("penalizes an explicitly different brand but not an absent brand", () => {
    const query = item("CORRENTE COMANDO SHINERAY XY-50Q 82L OSI");
    const same = scoreProductCandidate(query, product("CORRENTE COMANDO SHINERAY XY 50Q 82L OSI"));
    const absent = scoreProductCandidate(query, product("CORRENTE COMANDO SHINERAY XY 50Q 82L"));
    const conflict = scoreProductCandidate(query, product("CORRENTE COMANDO SHINERAY XY 50Q 82L VEDAMOTORS"));
    expect(same.deterministicScore).toBeGreaterThan(conflict.deterministicScore);
    expect(absent.scoreBreakdown.conflicts).not.toContain("brand");
    expect(conflict.scoreBreakdown.conflicts).toContain("brand");
  });

  it("does not allow semantic similarity to overcome an explicit part type conflict", () => {
    const candidate = scoreProductCandidate(item("CORRENTE COMANDO SHINERAY XY50Q"), { ...product("JG JUNTA MOTO SHINERAY XY50Q"), retrievalSemanticScore: 1 });
    expect(candidate.scoreBreakdown.semanticScore).toBe(1);
    expect(candidate.scoreBreakdown.partTypeConflict).toBe(true);
    expect(candidate.deterministicScore).toBeLessThanOrEqual(0.18);
  });

  it("rejects an externalId that was not in the retrieved candidates", () => {
    expect(() => validateRerankResult({ status: "MATCH_PROBABLE", ranking: [{ externalId: "invented", confidence: 0.99, reason: "x" }] }, new Set(["allowed"]))).toThrow("fora dos candidatos");
  });

  it("always passes store and provider isolation to retrieval", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const search = vi.fn().mockResolvedValue([product("CABO VELOCIMETRO TIT 150", "1")]);
    const repository: ProductRetrievalRepository = { search };
    await retrieveProductCandidates({ storeId: "store-a", provider: "cci", item: item("CABO VELOCIMETRO TIT 150") }, repository);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ scope: { storeId: "store-a", provider: "cci" }, queryEmbedding: null, limit: 15 }));
  });

  it("falls back to deterministic ranking when the reranker times out", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([product("CABO VELOCIMETRO TIT 150 ES", "1"), product("CABO VELOCIMETRO TIT 150 KS", "2")]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockRejectedValue(new DOMException("timeout", "AbortError")) };
    const result = await matchPurchaseDocumentItem({ storeId: "store-a", provider: "cci", item: item("CABO VELOCIMETRO TIT 150") }, { repository, reranker });
    expect(result.method).toBe("deterministic");
    expect(result.candidates[0].deterministicScore).toBeGreaterThanOrEqual(result.candidates[1].deterministicScore);
  });

  it("uses the complete AI ranking and keeps structured confidence as a safety floor", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("CHAVE LUZ TITAN 150 04/08 ES", "150"),
      product("CHAVE LUZ TITAN 00/04 ES", "2000"),
      product("CHAVE LUZ TITAN 95/99", "old"),
    ]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({
      bestExternalId: "2000",
      confidence: 0.95,
      status: "MATCH_PROBABLE",
      reason: "Ano correto.",
      ranking: [
        { externalId: "2000", confidence: 0.95, reason: "Ano correto." },
        { externalId: "150", confidence: 0.2, reason: "Outra geração." },
        { externalId: "old", confidence: 0.1, reason: "Outra geração." },
      ],
    }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("CHAVE LUZ TIT 2000 ES") }, { repository, reranker });
    expect(result.candidates.map((candidate) => candidate.externalId)).toEqual(["2000", "150", "old"]);
    expect(result.candidates[0]).toMatchObject({ aiConfidence: 0.95, finalScore: 0.95 });
    expect(result.diagnostics?.candidates.find((candidate) => candidate.externalId === "2000")).toMatchObject({
      aiRerankerScore: 0.95,
      aiRerankerReason: "Ano correto.",
      finalRank: 1,
    });
  });

  it("keeps an exact supplierCode candidate in the OpenAI Top 10", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const query = { ...item("GUIA CORRENTE COMAND"), supplierCode: "14611KREG00" };
    const distractors = Array.from({ length: 12 }, (_, index) => ({
      ...product(`GUIA CORR COMANDO MODELO ${index}`, `wrong-${index}`),
      retrievalSemanticScore: 1,
    }));
    const correct = {
      ...product("GUIA CORR COMANDO TIT 160/BROS - HONDA 14611KREG00", "3507"),
      searchText: "GUIA CORR COMANDO TIT 160 BROS HONDA 14611KREG00 6334 DIVERSOS",
      retrievalSemanticScore: 0.1,
    };
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([...distractors, correct]) };
    const rerank = vi.fn().mockResolvedValue({
      bestExternalId: "3507",
      confidence: 0.98,
      status: "MATCH_PROBABLE",
      reason: "Código de fabricante exato e peça compatível.",
      ranking: [{ externalId: "3507", confidence: 0.98, reason: "Código exato." }],
    });
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: query }, { repository, reranker: { rerank } });
    const openAiCandidates = rerank.mock.calls[0]?.[0].candidates as ErpProductRecord[];
    expect(openAiCandidates).toHaveLength(10);
    expect(openAiCandidates[0]).toMatchObject({ externalId: "3507", scoreBreakdown: { exactReferenceMatch: true, referenceMatchSource: "search_text" } });
    expect(result.candidates[0].externalId).toBe("3507");
  });
});
