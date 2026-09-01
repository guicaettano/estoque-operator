import { evaluateProductCompatibility, withInferredPartType } from "@/lib/product-matching/compatibility";
import { tryGenerateQueryEmbedding } from "@/lib/product-matching/embeddings";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { normalizeProductDescription, productTokens } from "@/lib/product-matching/normalize";
import { productReferenceQueries } from "@/lib/product-matching/reference";
import { scoreProductCandidate } from "@/lib/product-matching/score";
import { SupabaseProductRetrievalRepository, type ProductRetrievalRepository } from "@/lib/product-matching/retrieval";
import type { MatchingCandidateDiagnostic, ProductCandidate, ProductCompatibility } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

type CompatibleCandidate = ProductCandidate & { compatibility: ProductCompatibility };
const RETRIEVAL_LIMIT = 30;

function compatibleCount(candidate: CompatibleCandidate) {
  const value = candidate.compatibility;
  return [value.vehicleCompatible, value.engineCompatible, value.yearCompatible, value.positionCompatible, value.variantCompatible, value.brandCompatible].filter((entry) => entry === true).length;
}

function exactReference(candidate: ProductCandidate) { return candidate.scoreBreakdown.exactReferenceMatch; }
function nearReference(candidate: ProductCandidate) { return candidate.scoreBreakdown.nearReferenceMatch; }

function calibratedConfidence(candidate: CompatibleCandidate) {
  if (exactReference(candidate)) return 0.99;
  if (candidate.compatibility.partTypeCompatibility === "UNKNOWN") return candidate.deterministicScore;
  return Math.min(0.94, 0.56 + Math.min(candidate.scoreBreakdown.lexicalScore, 1) * 0.18 + Math.min(candidate.scoreBreakdown.semanticScore ?? 0, 1) * 0.05 + Math.min(compatibleCount(candidate), 4) * 0.045);
}

function compare(first: CompatibleCandidate, second: CompatibleCandidate) {
  const exact = Number(exactReference(second)) - Number(exactReference(first));
  if (exact) return exact;
  const near = Number(nearReference(second)) - Number(nearReference(first));
  if (near) return near;
  const identity = Number(second.compatibility.partTypeCompatibility === "COMPATIBLE") - Number(first.compatibility.partTypeCompatibility === "COMPATIBLE");
  if (identity) return identity;
  const compatible = compatibleCount(second) - compatibleCount(first);
  if (compatible) return compatible;
  const structured = second.deterministicScore - first.deterministicScore;
  if (structured) return structured;
  const lexical = second.scoreBreakdown.lexicalScore - first.scoreBreakdown.lexicalScore;
  return lexical || (second.scoreBreakdown.semanticScore ?? 0) - (first.scoreBreakdown.semanticScore ?? 0);
}

export async function buildStructuredCandidatePool(input: { storeId: string; provider: string; item: PurchaseDocumentItem; queryEmbedding?: number[] | null }, repository: ProductRetrievalRepository = new SupabaseProductRetrievalRepository()) {
  const rawIntent = parseProductIntent(input.item);
  const intent = withInferredPartType(rawIntent);
  const queryText = normalizeProductDescription(input.item.description);
  const terms = productTokens(queryText).filter((token) => token.length >= 3 || /^\d+$/.test(token));
  const references = productReferenceQueries(input.item);
  const queryEmbedding = input.queryEmbedding === undefined ? await tryGenerateQueryEmbedding(queryText) : input.queryEmbedding;
  const products = await repository.search({ scope: { storeId: input.storeId, provider: input.provider }, item: input.item, intent, queryText, terms, references, queryEmbedding, limit: RETRIEVAL_LIMIT });
  const retrieval: CompatibleCandidate[] = products.map((product) => {
    const initialScore = scoreProductCandidate(input.item, product, { intent });
    const compatibility = evaluateProductCompatibility(rawIntent, initialScore.parsedIntent);
    const scored = compatibility.partTypeCompatibility === "UNKNOWN"
      ? scoreProductCandidate(input.item, product, { intent: { ...intent, partType: null } })
      : initialScore;
    const parsedIntent = withInferredPartType(scored.parsedIntent);
    return { ...scored, parsedIntent, compatibility };
  }).sort((first, second) => Number(exactReference(second)) - Number(exactReference(first)) || Number(nearReference(second)) - Number(nearReference(first)) || Math.max(second.scoreBreakdown.lexicalScore, second.scoreBreakdown.semanticScore ?? 0) - Math.max(first.scoreBreakdown.lexicalScore, first.scoreBreakdown.semanticScore ?? 0)).slice(0, RETRIEVAL_LIMIT);
  const eligible = retrieval.filter((candidate) => candidate.compatibility.hardConflicts.length === 0).map((candidate) => { const value = calibratedConfidence(candidate); return { ...candidate, deterministicScore: value, finalScore: value }; }).sort(compare);
  const ranks = new Map(eligible.map((candidate, index) => [candidate.productId, index + 1]));
  const diagnostics: MatchingCandidateDiagnostic[] = retrieval.map((candidate, index) => ({
    retrievalRank: index + 1,
    rawRetrievalRank: index + 1,
    rawRetrievalScore: Math.max(candidate.scoreBreakdown.lexicalScore, candidate.scoreBreakdown.semanticScore ?? 0),
    externalId: candidate.externalId,
    description: candidate.description,
    reference: candidate.reference,
    barcode: candidate.barcode,
    supplier: candidate.supplier,
    normalizedSupplierCode: candidate.scoreBreakdown.normalizedSupplierCode,
    exactReferenceMatch: candidate.scoreBreakdown.exactReferenceMatch,
    nearReferenceMatch: candidate.scoreBreakdown.nearReferenceMatch,
    referenceMatchSource: candidate.scoreBreakdown.referenceMatchSource,
    query: input.item.description,
    candidate: candidate.description,
    parsedIntent: candidate.parsedIntent,
    semanticScore: candidate.scoreBreakdown.semanticScore,
    lexicalScore: candidate.scoreBreakdown.lexicalScore,
    queryPartTypeRaw: candidate.compatibility.queryPartTypeRaw,
    candidatePartTypeRaw: candidate.compatibility.candidatePartTypeRaw,
    queryPartTypeCanonical: candidate.compatibility.queryPartTypeCanonical,
    candidatePartTypeCanonical: candidate.compatibility.candidatePartTypeCanonical,
    compatibility: candidate.compatibility.partTypeCompatibility,
    reason: candidate.compatibility.reason,
    compatibilityReason: candidate.compatibility.reason,
    hardConflicts: candidate.compatibility.hardConflicts,
    structuredScore: eligible.find((value) => value.productId === candidate.productId)?.deterministicScore ?? candidate.deterministicScore,
    aiRerankerCalled: false,
    aiRerankerScore: null,
    aiRerankerReason: null,
    scoreBeforeThreshold: candidate.deterministicScore,
    threshold: 0.72,
    removed: candidate.compatibility.hardConflicts.length > 0,
    removedByCompatibilityGate: candidate.compatibility.hardConflicts.length > 0,
    removedAt: candidate.compatibility.hardConflicts.length > 0 ? "compatibility" : null,
    removedReason: candidate.compatibility.hardConflicts.length > 0 ? candidate.compatibility.reason : null,
    finalRank: ranks.get(candidate.productId) ?? null,
  }));
  return { intent, retrieval, eligible, diagnostics, hydrationDiagnostics: repository.getLastDiagnostics?.() ?? null };
}
