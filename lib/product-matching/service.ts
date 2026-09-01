import { MATCHING_CONFIG } from "@/lib/product-matching/config";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";
import { OpenAIProductCandidateReranker } from "@/lib/product-matching/reranker";
import type { ProductRetrievalRepository } from "@/lib/product-matching/retrieval";
import { buildStructuredCandidatePool } from "@/lib/product-matching/structured-ranking";
import type { MatchStatus, MatchingCandidateDiagnostic, ProductCandidate, ProductCandidateReranker, ProductMatchResult, RerankResult } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

const FINAL_LIMIT = 3;
const RERANK_LIMIT = 10;
const APPLICATION_SENSITIVE_PARTS = new Set(["JUNTA MOTOR", "PATIM FREIO", "TUBO INTERNO BENGALA", "ROLAMENTO", "AMORTECEDOR", "COXIM COROA TRANSMISSAO"]);

function requiresHumanReviewForMissingContext(parsedIntent: ProductMatchResult["parsedIntent"], candidate: ProductCandidate | undefined) {
  if (!candidate) return false;
  const normalized = normalizeProductDescription(parsedIntent.rawDescription);
  const applicationSensitive = Boolean(parsedIntent.partType && APPLICATION_SENSITIVE_PARTS.has(parsedIntent.partType))
    || (/\bJUNTA\b/.test(normalized) && /\bMOTOR\b/.test(normalized));
  const missingApplication = applicationSensitive && parsedIntent.vehicleModels.length === 0 && !candidate.scoreBreakdown.exactReferenceMatch;
  const unspecifiedPosition = parsedIntent.positions.length === 0 && candidate.parsedIntent.positions.length > 0;
  return missingApplication || unspecifiedPosition;
}

function statusFor(candidates: ProductCandidate[], parsedIntent: ProductMatchResult["parsedIntent"]): MatchStatus {
  if (!candidates.length) return "NO_CONFIDENT_MATCH";
  if (requiresHumanReviewForMissingContext(parsedIntent, candidates[0])) return "REVIEW_REQUIRED";
  if (!parsedIntent.partType || candidates[0].compatibility?.partTypeCompatibility !== "COMPATIBLE") return "REVIEW_REQUIRED";
  return candidates[0].deterministicScore >= 0.72 ? "MATCH_PROBABLE" : "REVIEW_REQUIRED";
}

function fastPath(candidates: ProductCandidate[], parsedIntent: ProductMatchResult["parsedIntent"]): "exact" | "deterministic" | null {
  const first = candidates[0]; if (!first || first.compatibility?.partTypeCompatibility !== "COMPATIBLE") return null;
  if (requiresHumanReviewForMissingContext(parsedIntent, first)) return null;
  if (first.scoreBreakdown.exactReferenceMatch || first.scoreBreakdown.nearReferenceMatch) return null;
  const margin = first.deterministicScore - (candidates[1]?.deterministicScore ?? 0);
  return first.deterministicScore >= 0.86 && margin >= 0.1 ? "deterministic" : null;
}

function hasExactReference(candidate: ProductCandidate) { return candidate.scoreBreakdown.exactReferenceMatch; }

function hasStrongStructuredEvidence(candidate: ProductCandidate | undefined) {
  if (!candidate || candidate.compatibility?.hardConflicts.length) return false;
  if (hasExactReference(candidate)) return true;
  
  // CRITICAL: CONFLICT explícito bloqueia; UNKNOWN não bloqueia
  if (candidate.compatibility?.partTypeCompatibility === "CONFLICT") return false;
  
  // Se é COMPATIBLE, usar critérios mais rigorosos
  if (candidate.compatibility?.partTypeCompatibility === "COMPATIBLE") {
    const positiveContext = [
      candidate.compatibility.vehicleCompatible,
      candidate.compatibility.engineCompatible,
      candidate.compatibility.yearCompatible,
      candidate.compatibility.positionCompatible,
      candidate.compatibility.variantCompatible,
      candidate.compatibility.brandCompatible,
    ].some((value) => value === true);
    const contradictedVehicle = candidate.compatibility.vehicleCompatible === false;
    return !contradictedVehicle && (positiveContext || candidate.deterministicScore >= MATCHING_CONFIG.probableScore);
  }
  
  // Se é UNKNOWN (ou ausente), preservar se score razoável e sem conflito de veículo
  const contradictedVehicle = candidate.compatibility?.vehicleCompatible === false;
  const reasonableScore = candidate.deterministicScore >= MATCHING_CONFIG.minimumCandidateScore * 1.5; // 0.3
  return !contradictedVehicle && reasonableScore;
}

function aiRankedCandidates(candidates: ProductCandidate[], result: RerankResult) {
  const resultById = new Map(result.ranking.map((entry, index) => [entry.externalId, { ...entry, index }]));
  return [...candidates].sort((first, second) => {
    const firstRank = resultById.get(first.externalId)?.index ?? Number.MAX_SAFE_INTEGER;
    const secondRank = resultById.get(second.externalId)?.index ?? Number.MAX_SAFE_INTEGER;
    return firstRank - secondRank;
  }).map((candidate) => {
    const ai = resultById.get(candidate.externalId);
    if (!ai) return candidate;
    const finalScore = hasStrongStructuredEvidence(candidate)
      ? Math.max(ai.confidence, candidate.deterministicScore)
      : ai.confidence;
    return { ...candidate, aiConfidence: ai.confidence, aiReason: ai.reason, finalScore };
  });
}

function completeDiagnostics(input: {
  diagnostics: MatchingCandidateDiagnostic[];
  finalCandidates: ProductCandidate[];
  aiCalled: boolean;
  rerankResult?: RerankResult;
  rerankError?: string;
}) {
  const finalRanks = new Map(input.finalCandidates.map((candidate, index) => [candidate.externalId, index + 1]));
  const aiById = new Map(input.rerankResult?.ranking.map((entry) => [entry.externalId, entry]) ?? []);
  const globalAiReason = input.rerankResult?.status === "NO_CONFIDENT_MATCH"
    ? input.rerankResult.reason
    : input.rerankError ?? null;
  return input.diagnostics.map((candidate) => {
    const finalRank = finalRanks.get(candidate.externalId) ?? null;
    const ai = aiById.get(candidate.externalId);
    const removedAfterGate = !candidate.removed && finalRank === null;
    const removedAt = candidate.removedAt ?? (removedAfterGate
      ? input.rerankResult?.status === "NO_CONFIDENT_MATCH" && !input.finalCandidates.length
        ? "reranker"
        : "final_limit"
      : null);
    const removedReason = candidate.removedReason ?? (removedAfterGate
      ? removedAt === "reranker"
        ? input.rerankResult?.reason ?? "ai_no_confident_match"
        : "outside_final_candidate_limit"
      : null);
    return {
      ...candidate,
      aiRerankerCalled: input.aiCalled,
      aiRerankerScore: ai?.confidence ?? null,
      aiRerankerReason: ai?.reason ?? globalAiReason,
      removed: candidate.removed || removedAfterGate,
      removedAt,
      removedReason,
      finalRank,
    };
  });
}

export async function matchPurchaseDocumentItem(input: { storeId: string; provider?: string; item: PurchaseDocumentItem; queryEmbedding?: number[] | null }, dependencies: { repository?: ProductRetrievalRepository; reranker?: ProductCandidateReranker } = {}): Promise<ProductMatchResult> {
  const provider = input.provider ?? "cci";
  const pool = await buildStructuredCandidatePool({ ...input, provider }, dependencies.repository);
  const buildResult = (result: Omit<ProductMatchResult, "item" | "normalizedQuery" | "parsedIntent" | "diagnostics">, trace: Parameters<typeof completeDiagnostics>[0]): ProductMatchResult => {
    const diagnostics = {
      query: input.item.description,
      parsedQuery: pool.intent,
      hydration: pool.hydrationDiagnostics,
      candidates: completeDiagnostics(trace),
    };
    if (process.env.NODE_ENV === "development") console.debug("[PRODUCT MATCHING]", JSON.stringify(diagnostics));
    return { item: input.item, normalizedQuery: normalizeProductDescription(input.item.description), parsedIntent: pool.intent, diagnostics, ...result };
  };
  const eligible = pool.eligible;
  const path = fastPath(eligible, pool.intent);
  if (path || !eligible.length) {
    const candidates = eligible.slice(0, FINAL_LIMIT);
    return buildResult(
      { status: statusFor(eligible, pool.intent), method: path ?? "deterministic", aiCalled: false, candidates },
      { diagnostics: pool.diagnostics, finalCandidates: candidates, aiCalled: false },
    );
  }
  const reranker = dependencies.reranker ?? (process.env.OPENAI_API_KEY ? new OpenAIProductCandidateReranker() : null);
  if (!reranker) {
    const candidates = eligible.slice(0, FINAL_LIMIT);
    return buildResult(
      { status: statusFor(eligible, pool.intent), method: "deterministic", aiCalled: false, candidates },
      { diagnostics: pool.diagnostics, finalCandidates: candidates, aiCalled: false },
    );
  }
  try {
    const result = await reranker.rerank({ item: input.item, parsedIntent: pool.intent, candidates: eligible.slice(0, RERANK_LIMIT) });
    if (!result.bestExternalId || result.status === "NO_CONFIDENT_MATCH") {
      const candidates = hasStrongStructuredEvidence(eligible[0]) ? eligible.slice(0, FINAL_LIMIT) : [];
      return buildResult(
        { status: candidates.length ? "REVIEW_REQUIRED" : "NO_CONFIDENT_MATCH", method: "ai_reranked", aiCalled: true, candidates },
        { diagnostics: pool.diagnostics, finalCandidates: candidates, aiCalled: true, rerankResult: result },
      );
    }
    const chosen = eligible.find((candidate) => candidate.externalId === result.bestExternalId);
    if (!chosen) throw new Error("Reranker escolheu candidato fora do gate.");
    const reranked = aiRankedCandidates(eligible, result).slice(0, FINAL_LIMIT);
    return buildResult(
      { status: result.status === "MATCH_PROBABLE" && requiresHumanReviewForMissingContext(pool.intent, reranked[0]) ? "REVIEW_REQUIRED" : result.status, method: "ai_reranked", aiCalled: true, candidates: reranked },
      { diagnostics: pool.diagnostics, finalCandidates: reranked, aiCalled: true, rerankResult: result },
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.warn("product-matching: AI fallback", error instanceof Error ? error.message : "unknown error");
    const candidates = eligible.slice(0, FINAL_LIMIT);
    return buildResult(
      { status: statusFor(eligible, pool.intent), method: "deterministic", aiCalled: true, candidates },
      { diagnostics: pool.diagnostics, finalCandidates: candidates, aiCalled: true, rerankError: error instanceof Error ? error.message : "unknown error" },
    );
  }
}
