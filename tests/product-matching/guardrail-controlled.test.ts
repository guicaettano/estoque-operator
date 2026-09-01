import { describe, expect, it, vi } from "vitest";
import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { ErpProductRecord, ProductCandidateReranker } from "@/lib/product-matching/types";
import type { ProductRetrievalRepository } from "@/lib/product-matching/retrieval";

const item = (description: string) => ({ supplierCode: null, supplierReference: null, description, quantity: 1, unitCost: 1, total: 1 });
const product = (description: string, externalId = description, stock = 1): ErpProductRecord => ({ 
  productId: externalId, 
  externalId, 
  description, 
  stock, 
  costPrice: 1, 
  salePrice: 2, 
  barcode: null, 
  reference: null, 
  supplier: null 
});

describe("Guardrail controlado end-to-end", () => {
  it("NO_CONFIDENT_MATCH + MATA C. compatível → REVIEW_REQUIRED com candidato preservado", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    
    // MATA CACHORRO e MATA C. representam o mesmo tipo de peça.
    const repository: ProductRetrievalRepository = { 
      search: vi.fn().mockResolvedValue([
        product("MATA CACHORRO TITAN 150 04/08", "unknown-high-score"),
      ]) 
    };
    
    const reranker: ProductCandidateReranker = { 
      rerank: vi.fn().mockResolvedValue({
        bestExternalId: null,
        confidence: 0.15,
        status: "NO_CONFIDENT_MATCH",
        reason: "Abreviação não reconhecida; não posso confirmar com certeza.",
        ranking: [
          { externalId: "unknown-high-score", confidence: 0.45, reason: "Possível, mas incerto." }
        ],
      }) 
    };
    
    const result = await matchPurchaseDocumentItem(
      { storeId: "store", provider: "cci", item: item("MATA C. C/TELA 150 04/08") }, 
      { repository, reranker }
    );
    
    // Guardrail deve preservar o protetor dianteiro compatível.
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].externalId).toBe("unknown-high-score");
    expect(result.diagnostics?.candidates[0]).toMatchObject({
      compatibility: "COMPATIBLE",
      aiRerankerCalled: true,
      removed: false,
      finalRank: 1,
    });
  });

  it("NO_CONFIDENT_MATCH + COMPATIBLE forte → REVIEW_REQUIRED com candidatos preservados", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    
    const repository: ProductRetrievalRepository = { 
      search: vi.fn().mockResolvedValue([
        product("MOTOR PARTIDA TITAN 150/FAN 150/125/NXR BROS - MAGNETRON", "6491"),
        product("MOTOR PARTIDA TITAN 150/FAN 150/125/NXR BROS - IRON", "1198"),
      ]) 
    };
    
    const reranker: ProductCandidateReranker = { 
      rerank: vi.fn().mockResolvedValue({
        bestExternalId: null,
        confidence: 0.12,
        status: "NO_CONFIDENT_MATCH",
        reason: "Não tenho certeza suficiente para escolher entre as opções.",
        ranking: [
          { externalId: "6491", confidence: 0.50, reason: "Possível MAGNETRON." },
          { externalId: "1198", confidence: 0.48, reason: "Possível IRON." },
        ],
      }) 
    };
    
    const result = await matchPurchaseDocumentItem(
      { storeId: "store", provider: "tagplus", item: item("MOTOR PARTIDA TIT 150 04/14 MAGN") }, 
      { repository, reranker }
    );
    
    // Guardrail deve preservar candidatos COMPATIBLE mesmo com NO_CONFIDENT_MATCH
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.map((c) => c.externalId)).toContain("6491");
    expect(result.candidates.map((c) => c.externalId)).toContain("1198");
  });

  it("NO_CONFIDENT_MATCH + todos CONFLICT → NO_CONFIDENT_MATCH com []", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    
    const repository: ProductRetrievalRepository = { 
      search: vi.fn().mockResolvedValue([
        product("REPARO PINÇA FREIO GOL/UNO/PARATI", "car1"),
        product("REPARO PINÇA FREIO CARAVAN/OPALA", "car2"),
        product("REPARO PINÇA FREIO FIAT/VW", "car3"),
      ]) 
    };
    
    const reranker: ProductCandidateReranker = { 
      rerank: vi.fn().mockResolvedValue({
        bestExternalId: null,
        confidence: 0.08,
        status: "NO_CONFIDENT_MATCH",
        reason: "Todas as opções são peças automotivas; o item é para moto.",
        ranking: [
          { externalId: "car1", confidence: 0.08, reason: "Conflito de aplicação." },
          { externalId: "car2", confidence: 0.06, reason: "Conflito de aplicação." },
          { externalId: "car3", confidence: 0.05, reason: "Conflito de aplicação." },
        ],
      }) 
    };
    
    const result = await matchPurchaseDocumentItem(
      { storeId: "store", provider: "tagplus", item: item("BORRACHA REPARO FREIO (PINCA) TIT 00/150 OSI") }, 
      { repository, reranker }
    );
    
    // Todos candidatos têm CONFLICT → pode resultar em vazio
    expect(result.status).toBe("NO_CONFIDENT_MATCH");
    expect(result.candidates).toEqual([]);
  });

  it("NO_CONFIDENT_MATCH + UNKNOWN score < 0.3 → NO_CONFIDENT_MATCH com []", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    
    // Candidato UNKNOWN com score baixo (descrição distante)
    const repository: ProductRetrievalRepository = { 
      search: vi.fn().mockResolvedValue([
        product("PRODUTO COMPLETAMENTE DIFERENTE SEM RELACAO", "low-score"),
      ]) 
    };
    
    const reranker: ProductCandidateReranker = { 
      rerank: vi.fn().mockResolvedValue({
        bestExternalId: null,
        confidence: 0.05,
        status: "NO_CONFIDENT_MATCH",
        reason: "Nenhuma correspondência razoável encontrada.",
        ranking: [
          { externalId: "low-score", confidence: 0.10, reason: "Muito distante." }
        ],
      }) 
    };
    
    const result = await matchPurchaseDocumentItem(
      { storeId: "store", provider: "cci", item: item("MOTOR PARTIDA TIT 150 04/14 MAGN") }, 
      { repository, reranker }
    );
    
    // Candidato UNKNOWN com score < 0.3 não deve ser preservado
    expect(result.status).toBe("NO_CONFIDENT_MATCH");
    expect(result.candidates).toEqual([]);
  });

  it("NO_CONFIDENT_MATCH + UNKNOWN com vehicle conflict → NO_CONFIDENT_MATCH com []", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    
    const repository: ProductRetrievalRepository = { 
      search: vi.fn().mockResolvedValue([
        product("PROTETOR ESCAPE TITAN 150 04/08", "titan-for-ybr"),
      ]) 
    };
    
    const reranker: ProductCandidateReranker = { 
      rerank: vi.fn().mockResolvedValue({
        bestExternalId: null,
        confidence: 0.10,
        status: "NO_CONFIDENT_MATCH",
        reason: "Veículo incompatível: TITAN vs YBR solicitado.",
        ranking: [
          { externalId: "titan-for-ybr", confidence: 0.25, reason: "Veículo errado." }
        ],
      }) 
    };
    
    const result = await matchPurchaseDocumentItem(
      { storeId: "store", provider: "tagplus", item: item("PROTETOR ESCAPE YBR 00/08 OSI") }, 
      { repository, reranker }
    );
    
    // UNKNOWN com vehicle conflict → não preservar
    expect(result.status).toBe("NO_CONFIDENT_MATCH");
    expect(result.candidates).toEqual([]);
  });
});
