import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateProductCompatibility } from "@/lib/product-matching/compatibility";
import { parseProductIntent } from "@/lib/product-matching/intent";
import type { ProductRetrievalRepository } from "@/lib/product-matching/retrieval";
import { scoreProductCandidate } from "@/lib/product-matching/score";
import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { ErpProductRecord, ProductCandidateReranker } from "@/lib/product-matching/types";
import { realMoto29Gold } from "@/tests/fixtures/real-moto-29-gold";

const item = (description: string, supplierCode: string | null = null) => ({ supplierCode, supplierReference: null, description, quantity: 1, unitCost: 1, total: 1 });
const product = (description: string, externalId = description, extra: Partial<ErpProductRecord> = {}): ErpProductRecord => ({ productId: externalId, externalId, description, stock: 1, costPrice: 1, salePrice: 2, barcode: null, reference: null, supplier: null, ...extra });
const compatibility = (query: string, candidate: string) => evaluateProductCompatibility(parseProductIntent(item(query)), parseProductIntent(item(candidate)));

afterEach(() => vi.unstubAllEnvs());

describe("new 29-item golden regressions", () => {
  it("tracks all 29 DANFE items with unique supplier codes", () => {
    expect(realMoto29Gold).toHaveLength(29);
    expect(new Set(realMoto29Gold.map((entry) => entry.supplierCode)).size).toBe(29);
  });
  it("keeps DFH00123A #3578 coherent instead of zero confidence", () => {
    const candidate = scoreProductCandidate(item("PATIM FREIO TRASEIRO SOBMEDIDA 0,25MM", "DFH00123A"), product("LONA FREIO TRAS BIZ/NXR BROS 0,25 - DIAFRAG 123A", "3578", { reference: "123A", searchText: "LONA FREIO TRAS BIZ NXR BROS 0 25 DIAFRAG 123A" }));
    expect(candidate.scoreBreakdown).toMatchObject({ nearReferenceMatch: true, specificationScore: 1, partTypeConflict: false });
    expect(candidate.scoreBreakdown.conflicts).not.toContain("specification");
    expect(candidate.deterministicScore).toBeGreaterThan(0.5);
  });

  it("promotes DFY00211 #4731 through its 211 reference fragment", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const correct = product("PATIM FREIO DIANT/TRAS YBR 125FACTOR/XTZ - DIAFRAG 211", "4731", { searchText: "PATIM FREIO DIANT TRAS YBR 125 FACTOR XTZ DIAFRAG 211" });
    const wrong = product("PATIM FREIO TRAS CG/TOD/TITAN 99 - DIAFFRAG", "3102");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([wrong, correct]) };
    const rerank = vi.fn().mockResolvedValue({ bestExternalId: "4731", confidence: 0.9, status: "REVIEW_REQUIRED", reason: "Código parcial e aplicação plausível.", ranking: [{ externalId: "4731", confidence: 0.9, reason: "Fragmento 211." }, { externalId: "3102", confidence: 0.2, reason: "Outra aplicação." }] });
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", queryEmbedding: null, item: item("PATIM FREIO DIANTEIRO/TRASEIRO", "DFY00211") }, { repository, reranker: { rerank } });
    expect(rerank.mock.calls[0]?.[0].candidates[0]).toMatchObject({ externalId: "4731", scoreBreakdown: { nearReferenceMatch: true } });
    expect(result.candidates[0].externalId).toBe("4731");
  });

  it.each([
    ["FILTRO COMBUSTIVEL", "BOMBA COMBUSTIVEL FAZER 250"],
    ["RETENTOR EMBREAGEM 12X22X5", "INTERRUPTOR EMBREAGEM BROS"],
    ["RETENTOR EMBREAGEM 12X22X5", "CABO EMBREAGEM YBR 125"],
    ["RETENTOR EMBREAGEM 12X22X5", "MANICOTO EMBREAGEM YBR 125"],
    ["RETENTOR EMBREAGEM 12X22X5", "MANETE EMBREAGEM YBR 125"],
    ["RETENTOR EMBREAGEM 12X22X5", "DISCO EMBREAGEM TITAN 150"],
    ["PATIM FREIO DIANTEIRO/TRASEIRO", "EIXO ABRE PATIM DIANT/TRAS 150"],
    ["COXIM COROA TRANSMISSAO", "COXIM ESCAPAMENTO STRADA"],
    ["COXIM COROA TRANSMISSAO", "COXIM MOTOR CORSA"],
  ])("blocks explicit part conflict: %s != %s", (query, candidate) => {
    expect(compatibility(query, candidate)).toMatchObject({ partTypeCompatibility: "CONFLICT", hardConflicts: expect.arrayContaining(["partType"]) });
  });

  it("blocks explicit DIR versus ESQ but not an absent position", () => {
    expect(compatibility("ROLAMENTO VIRABREQUIM DIR", "ROLAMENTO VIRABREQUIM ESQ")).toMatchObject({ positionCompatible: false, hardConflicts: expect.arrayContaining(["position"]) });
    expect(compatibility("ROLAMENTO VIRABREQUIM", "ROLAMENTO VIRABREQUIM ESQ")).toMatchObject({ positionCompatible: null, hardConflicts: [] });
  });

  it("blocks an explicit motorcycle versus car domain conflict", () => {
    expect(compatibility("BUCHA GARFO TRASEIRO KIT", "BUCHA EIXO TRASEIRO GOL/PARATI")).toMatchObject({ domainCompatible: false, hardConflicts: expect.arrayContaining(["domain"]) });
  });

  it("ranks the explicit 94L chain above 90L and 92L", () => {
    const query = item("CORRENTE COMANDO (404SV-94L)", "10116971");
    const correct = scoreProductCandidate(query, product("CORRENTE COMANDO TITAN/BROS 150 94L", "1899"));
    const wrong90 = scoreProductCandidate(query, product("CORRENTE COMANDO TITAN 150 90L", "90"));
    const wrong92 = scoreProductCandidate(query, product("CORRENTE COMANDO TITAN 150 92L", "92"));
    expect(correct.scoreBreakdown.specificationScore).toBe(1);
    expect(wrong90.scoreBreakdown.conflicts).toContain("specification");
    expect(wrong92.scoreBreakdown.conflicts).toContain("specification");
    expect(correct.deterministicScore).toBeGreaterThan(Math.max(wrong90.deterministicScore, wrong92.deterministicScore));
  });

  it.each([
    ["TUBO INTERNO BENGALA", "TUBO INTERNO BENGALA TITAN 150"],
    ["PATIM FREIO DIANTEIRO/TRASEIRO", "PATIM FREIO DIANT/TRAS YBR 125"],
    ["JUNTA MOTOR", "JUNTA MOTOR BIZ 125"],
  ])("caps missing application at REVIEW_REQUIRED: %s", async (query, candidate) => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([product(candidate, "candidate")]) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "cci", queryEmbedding: null, item: item(query, "NO_MATCHING_REFERENCE") }, { repository });
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("allows a trusted exact supplierCode to overcome missing application", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([product("AMORTECEDOR MOTO TITAN 150/FAN 150 - COFAP CR22540M", "4643", { searchText: "AMORTECEDOR MOTO TITAN 150 FAN 150 COFAP CR22540M" })]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({ bestExternalId: "4643", confidence: 0.99, status: "MATCH_PROBABLE", reason: "Código exato.", ranking: [{ externalId: "4643", confidence: 0.99, reason: "Código exato." }] }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", queryEmbedding: null, item: item("AMORTECEDOR TRASEIRO C/REGULAGEM", "CR22540M") }, { repository, reranker });
    expect(result).toMatchObject({ status: "MATCH_PROBABLE", candidates: [expect.objectContaining({ externalId: "4643" })] });
  });

  it("blocks an automotive ignition module for an explicitly motorcycle CDI query", async () => {
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("MODULO IGNICAO CHEVETTE/MONZA/PAMPA", "5799"),
    ]) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", queryEmbedding: null, item: item("CDI MODULO IGNICAO", "90271190") }, { repository });
    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics?.candidates[0]?.hardConflicts).toContain("domain");
  });

  it("keeps an application-less upper engine gasket kit in review", async () => {
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([
      product("JUNTA KIT SUP. MOTOR FARE 1.0/1.3 8V", "7016"),
    ]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({ bestExternalId: "7016", confidence: 0.9, status: "MATCH_PROBABLE", reason: "candidate", ranking: [{ externalId: "7016", confidence: 0.9, reason: "candidate" }] }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", queryEmbedding: null, item: item("KIT A JUNTA SUPERIOR MOTOR", "VS05610000120") }, { repository, reranker });
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("keeps a position-specific crankshaft bearing in review when input omits DIR/ESQ", async () => {
    const candidate = product("ROLAMENTO MOTO VIRABLEQ TITAN 150/BROS/FAN 125 09 DIR - INA 752006100", "3336");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([candidate]) };
    const reranker: ProductCandidateReranker = { rerank: vi.fn().mockResolvedValue({ bestExternalId: "3336", confidence: 0.91, status: "MATCH_PROBABLE", reason: "candidate", ranking: [{ externalId: "3336", confidence: 0.91, reason: "candidate" }] }) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", queryEmbedding: null, item: item("ROLAMENTO VIRABREQUIM", "752000610") }, { repository, reranker });
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("keeps exact #5550 Top1 but in review when position is absent", async () => {
    const candidate = product("ROLAMENTO VIRAB TITAN 150/NXR BROS DIR - INA", "5550", { reference: "752000610" });
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([candidate]) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "cci", queryEmbedding: null, item: item("ROLAMENTO VIRABREQUIM", "752000610") }, { repository });
    expect(result).toMatchObject({ status: "REVIEW_REQUIRED", candidates: [expect.objectContaining({ externalId: "5550" })] });
  });

  it("preserves KL741 #1820 as the exact TagPlus filter", async () => {
    const correct = product("FILTRO MOTO COMBUSTIVEL UNIVERSAL - MAHLE KL741", "1820", { searchText: "FILTRO MOTO COMBUSTIVEL UNIVERSAL MAHLE KL741" });
    const wrong = product("BOMBA COMBUSTIVEL FAZER 250", "wrong");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([wrong, correct]) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "tagplus", queryEmbedding: null, item: item("FILTRO COMBUSTIVEL", "KL741") }, { repository });
    expect(result.candidates[0]).toMatchObject({ externalId: "1820", scoreBreakdown: { exactReferenceMatch: true } });
  });

  it("does not rank EIXO ABRE PATIM over 0302CP brake shoes", async () => {
    const correct = product("PATIM FREIO DIANT/TRAS - COBREQ 0302CP", "correct", { searchText: "PATIM FREIO DIANT TRAS COBREQ 0302CP" });
    const axle = product("EIXO ABRE PATIM DIANT/TRAS TITAN 150", "axle");
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([axle, correct]) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "cci", queryEmbedding: null, item: item("PATIM FREIO DIANTEIRO/TRASEIRO", "0302CP") }, { repository });
    expect(result.candidates[0]?.externalId).toBe("correct");
    expect(result.diagnostics?.candidates.find((entry) => entry.externalId === "axle")?.removedByCompatibilityGate).toBe(true);
  });

  it.each([
    ["VA0510029", "VALVULA MOTOR ADM (30 X 5.43 X 92.88)", "VALVULA ADM POP 110/BIZ 110 VA0510029"],
    ["7666N", "RETENTOR PINHAO 20X38X5", "RETENTOR PINHAO 20X38X5 7666N"],
  ])("preserves exact structured evidence for %s", async (reference, description, candidateDescription) => {
    const candidate = product(candidateDescription, reference, { searchText: candidateDescription });
    const repository: ProductRetrievalRepository = { search: vi.fn().mockResolvedValue([candidate]) };
    const result = await matchPurchaseDocumentItem({ storeId: "store", provider: "cci", queryEmbedding: null, item: item(description, reference) }, { repository });
    expect(result.candidates[0]?.scoreBreakdown.exactReferenceMatch).toBe(true);
  });
});
