import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateProductCompatibility } from "@/lib/product-matching/compatibility";
import { parseProductIntent } from "@/lib/product-matching/intent";
import type { ProductRetrievalRepository } from "@/lib/product-matching/retrieval";
import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { ErpProductRecord, ProductCandidateReranker } from "@/lib/product-matching/types";

const item = (description: string) => ({ supplierCode: null, supplierReference: null, description, quantity: 1, unitCost: 1, total: 1 });
const product = (description: string, externalId = description): ErpProductRecord => ({ productId: externalId, externalId, description, stock: 1, costPrice: 1, salePrice: 2, barcode: null, reference: null, supplier: null });
const compare = (query: string, candidate: string) => evaluateProductCompatibility(parseProductIntent(item(query)), parseProductIntent(item(candidate)));

afterEach(() => vi.unstubAllEnvs());

describe("compatibility gate tri-state", () => {
  it.each([
    ["ESCAPE YBR 00/08", "ESCAPAMENTO YBR 00/08"],
    ["MANICOTO EMBR FAZER 250", "MANICOTO EMBREAGEM FAZER 250"],
    ["FIACAO PAINEL TITAN 150", "CHICOTE PAINEL TITAN 150"],
    ["CAMARA AR TRAS BIZ", "CAMARA AR TRAS BIZ/POP"],
    ["CANELA BENGALA TITAN 150", "CILINDRO EXTERNO BENGALA TITAN 150"],
    ["TUBO INTERNO BENGALA TITAN 150", "TUBO INTERNO BANGALA TITAN 150"],
    ["TUBO INTERNO BENGALA TITAN 150", "TUBO INT INFERIOR BENGALA TITAN 150"],
    ["PROTETOR ESCAPE TITAN 150", "PROTECAO ESCAPAMENTO TITAN 150"],
    ["GUIA CORRENTE TRANS BROS 150", "GUIA CORRENTE TRACAO BROS 150"],
    ["GUIA CORRENTE TRANS BROS 150", "GUIA CORR TRACAO NXR BROS 150"],
    ["BORRACHA REPARO FREIO PINCA TITAN 150", "REPARO MOTO FREIO DISCO TITAN 150"],
    ["INTERRUPTOR PART YBR 125", "INTERRUPTOR MOTO PARTIDA YBR 125"],
    ["EIXO ABRE PATIN CB 300", "EIXO ABRE PATIM CB 300"],
  ])("canonicalizes a compatible alias: %s", (query, candidate) => {
    const result = compare(query, candidate);
    expect(result.partTypeCompatibility).toBe("COMPATIBLE");
    expect(result.hardConflicts).not.toContain("partType");
  });

  it.each([
    ["MOTOR PARTIDA TIT 150", "TAMPA MOTOR PARTIDA TITAN 150"],
    ["MOTOR PARTIDA TIT 150", "KIT VEDACAO MOTOR PARTIDA TITAN 150"],
    ["DISCO FREIO DIANT TIT/BROS", "INTERRUPTOR FREIO DIANT TIT/BROS"],
    ["CORRENTE COMANDO SHINERAY", "VARETA FREIO TITAN"],
    ["CANELA BENGALA DIR TITAN 150", "PEDALEIRA TRAS TITAN 150"],
    ["REPARO FREIO PINCA TIT", "FLEXIVEL FREIO TIT"],
    ["CHAVE LUZ TIT 2000 ES", "ANEL TAMPA PARTIDA TITAN 2000 ES"],
    ["CABO VELOCIMETRO TIT 150", "CABO EMBREAGEM TIT 150"],
    ["INTERRUPTOR PART YBR 125", "INTERRUPTOR MOTO FREIO YBR 125"],
    ["INTERRUPTOR PART YBR 125", "INTERRUPTOR MOTO EMERGENCIA YBR 125"],
  ])("blocks an explicit high-confidence conflict: %s", (query, candidate) => {
    const result = compare(query, candidate);
    expect(result.partTypeCompatibility).toBe("CONFLICT");
    expect(result.hardConflicts).toContain("partType");
  });

  it("recognizes MATA C. as PROTETOR DIANTEIRO", () => {
    const result = compare("MATA C. C/TELA 150 04/08", "PROTETOR DIANTEIRO TITAN 150 04/08");
    expect(result).toMatchObject({ partTypeCompatibility: "COMPATIBLE", queryPartTypeCanonical: "PROTETOR DIANTEIRO", hardConflicts: [] });
  });

  it("treats absent position and variant as unknown, not conflicting", () => {
    expect(compare("CANELA BENGALA DIR TITAN 150 ESD", "CANELA BENGALA TITAN 150")).toMatchObject({
      partTypeCompatibility: "COMPATIBLE",
      positionCompatible: null,
      variantCompatible: null,
      hardConflicts: [],
    });
  });

  it("canonicalizes VEDA and VEDAM as the same manufacturer", () => {
    expect(compare("ANEL ESCAPE DAFRA 150 VEDAM", "ANEL ESCAP DAFRA 150 VEDA")).toMatchObject({ partTypeCompatibility: "COMPATIBLE", brandCompatible: true });
  });

  it("removes conflicts before the reranker and promotes an existing correct candidate", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([product("ANEL TAMPA PARTIDA TITAN 2000 ES", "wrong"), product("CHAVE LUZ TITAN 00/03 ES/KSE - OSI", "correct")]) };
    const rerank = vi.fn().mockResolvedValue({ bestExternalId: "correct", confidence: 0.93, status: "MATCH_PROBABLE", reason: "Mesma peça.", ranking: [{ externalId: "correct", confidence: 0.93, reason: "Mesma peça." }] });
    const reranker: ProductCandidateReranker = { rerank };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("CHAVE LUZ TIT 2000 ES") }, { repository, reranker });
    expect(rerank).toHaveBeenCalledWith(expect.objectContaining({ candidates: [expect.objectContaining({ externalId: "correct" })] }));
    expect(result.candidates[0].externalId).toBe("correct");
    expect(result.diagnostics?.candidates.find((candidate) => candidate.externalId === "wrong")).toMatchObject({ removed: true, compatibility: "CONFLICT" });
  });

  it("does not let an exact supplierCode bypass an explicit part-type conflict", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const query = { ...item("MOTOR PARTIDA TIT 150"), supplierCode: "ABC123" };
    const conflicting = { ...product("TAMPA MOTOR PARTIDA TITAN 150 ABC123", "wrong"), searchText: "TAMPA MOTOR PARTIDA TITAN 150 ABC123" };
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([conflicting]) };
    const rerank = vi.fn();
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: query }, { repository, reranker: { rerank } });
    expect(rerank).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "NO_CONFIDENT_MATCH", candidates: [] });
    expect(result.diagnostics?.candidates[0]).toMatchObject({ exactReferenceMatch: true, removedByCompatibilityGate: true });
  });

  it("keeps compatible front-protector candidates available to the normal reranker", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([product("PROTETOR DIANTEIRO TITAN 150 04/08", "candidate")]) };
    const rerank = vi.fn().mockResolvedValue({ bestExternalId: "candidate", confidence: 0.81, status: "REVIEW_REQUIRED", reason: "Abreviação ambígua.", ranking: [{ externalId: "candidate", confidence: 0.81, reason: "Abreviação ambígua." }] });
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "cci", item: item("MATA C. C/TELA 150 04/08") }, { repository, reranker: { rerank } });
    expect(rerank).toHaveBeenCalledWith(expect.objectContaining({ candidates: [expect.objectContaining({ compatibility: expect.objectContaining({ partTypeCompatibility: "COMPATIBLE" }) })] }));
    expect(result.candidates[0]).toMatchObject({ externalId: "candidate", aiConfidence: 0.81 });
  });

  it("keeps the correct motor ahead and removes tampa/kit", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("TAMPA MOTOR PARTIDA TITAN 150", "tampa"),
      product("KIT VEDACAO MOTOR PARTIDA TITAN 150", "kit"),
      product("MOTOR PARTIDA TITAN 150/BROS/FAN 125 - MAGNETRON", "motor"),
    ]) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("MOTOR PARTIDA TIT 150 04/14 MAGN") }, { repository });
    expect(result.candidates[0].externalId).toBe("motor");
    expect(result.candidates.map((candidate) => candidate.externalId)).not.toContain("tampa");
    expect(result.candidates.map((candidate) => candidate.externalId)).not.toContain("kit");
  });

  it("returns NO_CONFIDENT_MATCH when every candidate is an explicit conflict", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([product("TAMPA MOTOR PARTIDA TITAN 150", "wrong")]) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("MOTOR PARTIDA TIT 150 04/14 MAGN") }, { repository });
    expect(result).toMatchObject({ status: "NO_CONFIDENT_MATCH", candidates: [] });
  });

  it("does not let an AI no-match erase a structurally strong candidate", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("MOTOR PARTIDA TITAN 150/FAN 150/125/NXR BROS - MAGNETRON", "6491"),
      product("MOTOR PARTIDA TITAN 150/FAN 150/125/NXR BROS - IRON", "1198"),
    ]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({
      bestExternalId: null,
      confidence: 0.1,
      status: "NO_CONFIDENT_MATCH",
      reason: "Evidência insuficiente.",
      ranking: [
        { externalId: "6491", confidence: 0.4, reason: "Possível." },
        { externalId: "1198", confidence: 0.3, reason: "Possível." },
      ],
    }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("MOTOR PARTIDA TIT 150 04/14 MAGN") }, { repository, reranker });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.candidates.map((candidate) => candidate.externalId)).toContain("6491");
    expect(result.diagnostics?.candidates.find((candidate) => candidate.externalId === "6491")).toMatchObject({
      aiRerankerCalled: true,
      removed: false,
      finalRank: 1,
    });
  });

  it("preserves compatible MATA CACHORRO candidates when AI returns NO_CONFIDENT_MATCH", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    // Usar descrição com overlap semântico alto para garantir score >= 0.3
    const mockCandidate = product("MATA CACHORRO TITAN 150 04/08", "unknown-candidate");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([mockCandidate]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({
      bestExternalId: null,
      confidence: 0.2,
      status: "NO_CONFIDENT_MATCH",
      reason: "Abreviação não reconhecida; não consigo confirmar.",
      ranking: [{ externalId: "unknown-candidate", confidence: 0.5, reason: "Possível, mas incerto." }],
    }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "cci", item: item("MATA C. C/TELA 150 04/08") }, { repository, reranker });
    // O alias reconhecido deve ser preservado para revisão humana.
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].externalId).toBe("unknown-candidate");
    expect(result.diagnostics?.candidates[0]).toMatchObject({
      compatibility: "COMPATIBLE",
      aiRerankerCalled: true,
      removed: false,
    });
  });

  it("preserves COMPATIBLE candidates when AI returns NO_CONFIDENT_MATCH", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("CHAVE LUZ TITAN 00/04 ES/KSE/KS - IRON", "5354"),
    ]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({
      bestExternalId: null,
      confidence: 0.15,
      status: "NO_CONFIDENT_MATCH",
      reason: "Faixa de ano pode não incluir 2000.",
      ranking: [{ externalId: "5354", confidence: 0.6, reason: "Compatível estruturalmente." }],
    }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "cci", item: item("CHAVE LUZ TIT 2000 ES OSI") }, { repository, reranker });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].externalId).toBe("5354");
  });

  it("allows NO_CONFIDENT_MATCH to clear candidates when all are explicit CONFLICT", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("REPARO PINÇA FREIO GOL/UNO/PARATI", "car1"),
      product("REPARO PINÇA FREIO CARAVAN/OPALA", "car2"),
    ]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({
      bestExternalId: null,
      confidence: 0.05,
      status: "NO_CONFIDENT_MATCH",
      reason: "Todas peças automotivas; query é moto.",
      ranking: [
        { externalId: "car1", confidence: 0.05, reason: "Conflito de aplicação." },
        { externalId: "car2", confidence: 0.03, reason: "Conflito de aplicação." },
      ],
    }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("BORRACHA REPARO FREIO (PINCA) TIT 00/150 OSI") }, { repository, reranker });
    // Todos candidates têm CONFLICT, então podem ser removidos
    expect(result.status).toBe("NO_CONFIDENT_MATCH");
    expect(result.candidates).toEqual([]);
  });

  it("handles normal OpenAI response with Top1 match correctly", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("MOTOR PARTIDA TITAN 150/FAN 150/125/NXR BROS - MAGNETRON", "6491"),
      product("MOTOR PARTIDA TITAN 150/FAN 150/125/NXR BROS - IRON", "1198"),
    ]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({
      bestExternalId: "6491",
      confidence: 0.94,
      status: "MATCH_PROBABLE",
      reason: "Mesma peça, mesma aplicação, mesmo fabricante.",
      ranking: [
        { externalId: "6491", confidence: 0.94, reason: "Perfeito." },
        { externalId: "1198", confidence: 0.92, reason: "Fabricante diferente." },
      ],
    }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("MOTOR PARTIDA TIT 150 04/14 MAGN") }, { repository, reranker });
    expect(result.status).toBe("MATCH_PROBABLE");
    expect(result.method).toBe("ai_reranked");
    expect(result.candidates[0].externalId).toBe("6491");
    expect(result.candidates[0].aiConfidence).toBe(0.94);
  });

  it("falls back safely to deterministic when AI errors without clearing candidates", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("MOTOR PARTIDA TITAN 150/FAN 150/125/NXR BROS - MAGNETRON", "6491"),
    ]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockRejectedValue(new Error("Timeout")) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("MOTOR PARTIDA TIT 150 04/14 MAGN") }, { repository, reranker });
    // Fallback determinístico preserva candidatos e pode ser MATCH_PROBABLE se score >= 0.72 + COMPATIBLE
    expect(result.status).toMatch(/REVIEW_REQUIRED|MATCH_PROBABLE/);
    expect(result.method).toBe("deterministic");
    expect(result.aiCalled).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].externalId).toBe("6491");
  });

  it("allows AI no-match when the only identity match contradicts the vehicle", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("PROTECAO ESCAPAMENTO TITAN 150 04/08", "titan"),
    ]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({
      bestExternalId: null,
      confidence: 0.1,
      status: "NO_CONFIDENT_MATCH",
      reason: "Veículo incompatível.",
      ranking: [{ externalId: "titan", confidence: 0.1, reason: "Veículo incompatível." }],
    }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("PROTETOR ESCAPE YBR 00/08 OSI") }, { repository, reranker });
    expect(result).toMatchObject({ status: "NO_CONFIDENT_MATCH", candidates: [] });
    expect(result.diagnostics?.candidates[0]).toMatchObject({ removedAt: "reranker", removedReason: "Veículo incompatível." });
  });

  it("sends motorcycle brake repair ahead of automotive repairs after domain canonicalization", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("REPARO PINÇA FREIO CARAVAN/OPALA", "car"),
      product("REPARO MOTO FREIO DISCO TITAN 150", "5913"),
    ]) };
    const rerank = vi.fn().mockResolvedValue({
      bestExternalId: "5913",
      confidence: 0.9,
      status: "MATCH_PROBABLE",
      reason: "Mesma aplicação.",
      ranking: [
        { externalId: "5913", confidence: 0.9, reason: "Mesma aplicação." },
        { externalId: "car", confidence: 0.01, reason: "Aplicação automotiva." },
      ],
    });
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", item: item("BORRACHA REPARO FREIO (PINCA) TIT 00/150 OSI") }, { repository, reranker: { rerank } });
    expect(rerank).toHaveBeenCalledWith(expect.objectContaining({
      candidates: expect.arrayContaining([expect.objectContaining({
        externalId: "5913",
        compatibility: expect.objectContaining({ partTypeCompatibility: "COMPATIBLE", vehicleCompatible: true }),
      })]),
    }));
    expect(result.candidates[0].externalId).toBe("5913");
  });
});
