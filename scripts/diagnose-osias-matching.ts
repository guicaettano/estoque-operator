import { MATCHING_CONFIG } from "@/lib/product-matching/config";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { normalizeProductDescription, productTokens } from "@/lib/product-matching/normalize";
import { OpenAIProductCandidateReranker } from "@/lib/product-matching/reranker";
import { searchProductCandidates } from "@/lib/product-matching/retrieval";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProductCandidate, RerankResult } from "@/lib/product-matching/types";
import { osiasMatchingGold, type GoldVerification, type MatchingGoldItem } from "@/tests/fixtures/osias-matching-gold";

type Provider = "cci" | "tagplus";
type Store = { id: string; provider: Provider };
type Metadata = { external_id: string; search_text: string | null; raw_data: unknown };
type Classification = "UNVERIFIED" | "PRODUCT_NOT_IN_CATALOG" | "RETRIEVAL_MISS" | "RANKING_ERROR" | "GOLD_AMBIGUOUS" | "CORRECT";
const useAi = process.env.MATCH_DIAGNOSE_USE_AI !== "false" && Boolean(process.env.OPENAI_API_KEY);

async function main() {
  const stores = await loadStores();
  const report = {
    generatedAt: new Date().toISOString(),
    useAi,
    gold: { total: osiasMatchingGold.length, cciVerified: osiasMatchingGold.filter((item) => item.cciVerification === "CONFIRMED").length, tagPlusVerified: osiasMatchingGold.filter((item) => item.tagPlusVerification === "CONFIRMED").length },
    signalDensity: await Promise.all((["cci", "tagplus"] as const).map((provider) => measureProvider(provider, stores[provider].id))),
    items: await diagnoseAll(stores),
  };
  console.log(JSON.stringify(report, null, 2));
}

async function diagnoseAll(stores: Record<Provider, Store>) {
  const items = [];
  for (const item of osiasMatchingGold) items.push(await diagnoseItem(item, stores));
  return items;
}

async function diagnoseItem(gold: MatchingGoldItem, stores: Record<Provider, Store>) {
  const item = { supplierCode: gold.supplierCode, supplierReference: null, description: gold.description, quantity: 1, unitCost: 0, total: null };
  const providers = await Promise.all((["cci", "tagplus"] as const).map(async (provider) => {
    const expectedId = provider === "cci" ? gold.correctCciExternalId : gold.correctTagPlusExternalId;
    const verification = provider === "cci" ? gold.cciVerification : gold.tagPlusVerification;
    const { intent, candidates } = await searchProductCandidates({ storeId: stores[provider].id, provider, item, limit: MATCHING_CONFIG.retrievalLimit });
    const rerank = useAi && candidates.length ? await rerankCandidates(item, candidates).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })) : null;
    const ranked = applyRerank(candidates, rerank && "ranking" in rerank ? rerank : null);
    const metadata = await loadMetadata(provider, stores[provider].id, candidates.map((candidate) => candidate.externalId));
    const exists = verification === "CONFIRMED" && expectedId ? await productExists(provider, stores[provider].id, expectedId) : null;
    const retrievalRank = expectedId ? candidates.findIndex((candidate) => candidate.externalId === expectedId) + 1 : 0;
    const finalRank = expectedId ? ranked.findIndex((candidate) => candidate.externalId === expectedId) + 1 : 0;
    return {
      provider, parsedIntent: intent, expectedExternalId: expectedId, verification,
      classification: classify(verification, expectedId, exists, retrievalRank, finalRank),
      correctProductExists: exists, retrievalRank: retrievalRank || "NOT_FOUND", finalRank: finalRank || "NOT_FOUND",
      status: statusFor(ranked), reranker: rerank && "error" in rerank ? rerank : rerank ? { status: rerank.status } : { skipped: true },
      directSearch: await directSearch(provider, stores[provider].id, gold),
      top15Retrieval: candidates.map((candidate, retrievalIndex) => renderCandidate(candidate, retrievalIndex + 1, ranked, metadata)),
    };
  }));
  return { supplierCode: gold.supplierCode, description: gold.description, correctCciExternalId: gold.correctCciExternalId, correctTagPlusExternalId: gold.correctTagPlusExternalId, notes: gold.notes ?? null, providers: Object.fromEntries(providers.map((provider) => [provider.provider, provider])) };
}

async function rerankCandidates(item: { supplierCode: string; supplierReference: string | null; description: string; quantity: number; unitCost: number; total: number | null }, candidates: ProductCandidate[]): Promise<RerankResult> {
  return new OpenAIProductCandidateReranker().rerank({ item, parsedIntent: parseProductIntent(item), candidates });
}

function applyRerank(candidates: ProductCandidate[], rerank: RerankResult | null) {
  const ai = new Map(rerank?.ranking.map((entry) => [entry.externalId, entry]) ?? []);
  return candidates.map((candidate) => {
    const entry = ai.get(candidate.externalId);
    let finalScore = entry ? (entry.confidence * 0.62) + (candidate.deterministicScore * 0.38) : candidate.deterministicScore * 0.38;
    if (candidate.scoreBreakdown.partTypeConflict) finalScore = Math.min(finalScore, MATCHING_CONFIG.conflicts.partTypeScoreCap);
    return { ...candidate, aiConfidence: entry?.confidence, aiReason: entry?.reason, finalScore };
  }).sort((first, second) => second.finalScore - first.finalScore);
}

function renderCandidate(candidate: ProductCandidate, retrievalRank: number, ranked: ProductCandidate[], metadata: Map<string, Metadata>) {
  const data = metadata.get(candidate.externalId);
  return { rank: ranked.findIndex((entry) => entry.externalId === candidate.externalId) + 1, retrievalRank, externalId: candidate.externalId, description: candidate.description,
    exactReferenceScore: candidate.scoreBreakdown.exactReferenceBonus, lexicalScore: candidate.scoreBreakdown.lexicalScore, semanticScore: candidate.scoreBreakdown.semanticScore, partTypeScore: candidate.scoreBreakdown.partTypeScore, vehicleScore: candidate.scoreBreakdown.vehicleScore, engineSizeScore: candidate.scoreBreakdown.engineSizeScore, yearScore: candidate.scoreBreakdown.yearScore, positionScore: candidate.scoreBreakdown.positionScore, variantScore: candidate.scoreBreakdown.variantScore, brandScore: candidate.scoreBreakdown.brandScore, specificationScore: candidate.scoreBreakdown.specificationScore, conflictPenalty: candidate.scoreBreakdown.conflictPenalty, partTypeConflict: candidate.scoreBreakdown.partTypeConflict, conflicts: candidate.scoreBreakdown.conflicts, retrievalScore: candidate.scoreBreakdown.retrievalScore, aiConfidence: candidate.aiConfidence ?? null, aiReason: candidate.aiReason ?? null, finalScore: candidate.finalScore, searchText: data?.search_text ?? null, rawDataUseful: usefulRawData(data?.raw_data) };
}

function classify(verification: GoldVerification, expectedId: string | null, exists: boolean | null, retrievalRank: number, finalRank: number): Classification {
  if (verification !== "CONFIRMED") return "UNVERIFIED";
  if (!expectedId) return "PRODUCT_NOT_IN_CATALOG";
  if (!exists) return "GOLD_AMBIGUOUS";
  if (!retrievalRank) return "RETRIEVAL_MISS";
  return finalRank === 1 ? "CORRECT" : "RANKING_ERROR";
}

function statusFor(candidates: ProductCandidate[]) { return (candidates[0]?.finalScore ?? 0) >= MATCHING_CONFIG.probableScore ? "MATCH_PROBABLE" : candidates.length ? "REVIEW_REQUIRED" : "NO_CONFIDENT_MATCH"; }

async function loadStores(): Promise<Record<Provider, Store>> {
  const { data, error } = await createSupabaseAdminClient().from("stores").select("id, provider").in("provider", ["cci", "tagplus"]);
  if (error) throw new Error(`[SUPABASE_READ_ERROR] Não foi possível ler lojas: ${error.message}`);
  const values = (data ?? []) as Store[]; const cci = values.find((row) => row.provider === "cci"); const tagplus = values.find((row) => row.provider === "tagplus");
  if (!cci || !tagplus) throw new Error("As lojas CCI e TagPlus devem estar conectadas.");
  return { cci, tagplus };
}

async function loadMetadata(provider: Provider, storeId: string, externalIds: string[]) {
  if (!externalIds.length) return new Map<string, Metadata>();
  const { data, error } = await createSupabaseAdminClient().from("erp_products").select("external_id, search_text, raw_data").eq("provider", provider).eq("store_id", storeId).in("external_id", externalIds);
  if (error) throw new Error(`[SUPABASE_READ_ERROR] Não foi possível ler candidatos: ${error.message}`);
  return new Map(((data ?? []) as Metadata[]).map((row) => [row.external_id, row]));
}

async function productExists(provider: Provider, storeId: string, externalId: string) {
  const { data, error } = await createSupabaseAdminClient().from("erp_products").select("external_id").eq("provider", provider).eq("store_id", storeId).eq("external_id", externalId).maybeSingle();
  if (error) throw new Error(`[SUPABASE_READ_ERROR] Não foi possível verificar produto correto: ${error.message}`);
  return Boolean(data);
}

async function directSearch(provider: Provider, storeId: string, item: MatchingGoldItem) {
  const ignored = new Set(["OSI", "UND", "KIT", "MOTO", "CROM", "SPORT"]);
  const terms = productTokens(normalizeProductDescription(item.description))
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token) && !ignored.has(token))
    .slice(0, 3);
  let query = createSupabaseAdminClient().from("erp_products").select("external_id, description, search_text, raw_data").eq("provider", provider).eq("store_id", storeId);
  for (const term of terms) query = query.ilike("search_text", `%${term}%`);
  const { data, error } = await query.limit(10);
  if (error) throw new Error(`[SUPABASE_READ_ERROR] Não foi possível buscar catálogo: ${error.message}`);
  return { terms, candidates: (data ?? []).map((row) => ({ externalId: String(row.external_id), description: String(row.description), searchText: row.search_text ? String(row.search_text) : null, rawDataUseful: usefulRawData(row.raw_data) })) };
}

async function measureProvider(provider: Provider, storeId: string) {
  const client = createSupabaseAdminClient(); const rows: Array<{ description: string | null; reference: string | null; barcode: string | null; supplier: string | null; search_text: string | null; embedding: unknown; raw_data: unknown }> = [];
  for (let from = 0; ; from += 1000) { const { data, error } = await client.from("erp_products").select("description, reference, barcode, supplier, search_text, embedding, raw_data").eq("provider", provider).eq("store_id", storeId).range(from, from + 999); if (error) throw new Error(`[SUPABASE_READ_ERROR] Não foi possível medir ${provider}: ${error.message}`); rows.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  const nonBlank = (key: "reference" | "barcode" | "supplier" | "search_text") => rows.filter((row) => Boolean(row[key]?.trim())).length; const total = rows.length || 1;
  return { provider, totalProducts: rows.length, referenceCoverage: nonBlank("reference") / total, barcodeCoverage: nonBlank("barcode") / total, supplierCoverage: nonBlank("supplier") / total, searchTextCoverage: nonBlank("search_text") / total, embeddingCoverage: rows.filter((row) => row.embedding !== null).length / total, averageDescriptionLength: rows.reduce((sum, row) => sum + (row.description?.length ?? 0), 0) / total, usefulRawDataCoverage: rows.filter((row) => Object.keys(usefulRawData(row.raw_data)).length > 0).length / total };
}

function usefulRawData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const indexed = new Map(Object.keys(raw).map((key) => [key.toLowerCase(), key]));
  const keys = ["codigo", "codigo_externo", "codigo_fabricante", "marca", "fornecedor", "fornecedores", "categoria", "descricao_curta", "descricao_longa", "codigo_barras", "ean", "referencia"];
  return Object.fromEntries(keys.flatMap((key) => {
    const actualKey = indexed.get(key);
    const entry = actualKey ? raw[actualKey] : null;
    return entry !== null && entry !== undefined && entry !== "" ? [[key, entry]] : [];
  }));
}

main().catch((error) => { console.error("Falha ao diagnosticar matching OSIAS."); console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });






