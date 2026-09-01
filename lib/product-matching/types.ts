import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

export type MatchStatus = "MATCH_PROBABLE" | "REVIEW_REQUIRED" | "NO_CONFIDENT_MATCH";
export type MatchMethod = "exact" | "deterministic" | "ai_reranked" | "manual";
export type ReviewItemStatus = "pending" | "matched" | "manual_match" | "new_product" | "ignored";
export type PartTypeCompatibility = "COMPATIBLE" | "UNKNOWN" | "CONFLICT";
export type ReferenceMatchSource = "reference" | "barcode" | "search_text" | "description" | null;
export type ParsedProductIntent = { rawDescription: string; partType: string | null; domain?: "MOTO" | "CAR" | "UNKNOWN"; vehicleModels: string[]; engineSizes: string[]; years: string[]; positions: string[]; variants: string[]; brand: string | null; reference: string | null; specifications: string[] };

export type ProductCompatibility = {
  partTypeCompatibility: PartTypeCompatibility;
  queryPartTypeRaw: string | null;
  candidatePartTypeRaw: string | null;
  queryPartTypeCanonical: string | null;
  candidatePartTypeCanonical: string | null;
  reason: string;
  vehicleCompatible: boolean | null;
  engineCompatible: boolean | null;
  yearCompatible: boolean | null;
  positionCompatible: boolean | null;
  variantCompatible: boolean | null;
  brandCompatible: boolean | null;
  domainCompatible?: boolean | null;
  hardConflicts: string[];
};

export type CandidateScoreBreakdown = { exactReferenceBonus: number; exactReferenceMatch: boolean; nearReferenceMatch: boolean; referenceMatchSource: ReferenceMatchSource; normalizedSupplierCode: string | null; lexicalScore: number; semanticScore: number | null; partTypeScore: number; vehicleScore: number; engineSizeScore: number; yearScore: number; positionScore: number; variantScore: number; brandScore: number; specificationScore: number; conflictPenalty: number; partTypeConflict: boolean; conflicts: string[]; retrievalScore: number };
export type ErpProductRecord = { productId: string; externalId: string; description: string; stock: number | null; costPrice: number | null; salePrice: number | null; barcode: string | null; reference: string | null; supplier: string | null; searchText?: string | null; rawData?: unknown; retrievalLexicalScore?: number | null; retrievalSemanticScore?: number | null };
export type ProductCandidate = ErpProductRecord & { deterministicScore: number; aiConfidence?: number; aiReason?: string; finalScore: number; parsedIntent: ParsedProductIntent; compatibility?: ProductCompatibility; scoreBreakdown: CandidateScoreBreakdown };

export type ProductRetrievalDiagnostics = {
  source: "supabase" | "tagplus_live";
  cachedCandidateCount: number | null;
  cachedReadError: string | null;
  liveAttempted: boolean;
  liveSucceeded: boolean | null;
  liveCandidateCount: number | null;
  hydrationError: string | null;
  cacheWriteError: string | null;
};

export type MatchingCandidateDiagnostic = {
  retrievalRank: number;
  rawRetrievalRank: number;
  rawRetrievalScore: number;
  externalId: string;
  description: string;
  reference: string | null;
  barcode: string | null;
  supplier: string | null;
  normalizedSupplierCode: string | null;
  exactReferenceMatch: boolean;
  nearReferenceMatch: boolean;
  referenceMatchSource: ReferenceMatchSource;
  query: string;
  candidate: string;
  parsedIntent: ParsedProductIntent;
  semanticScore: number | null;
  lexicalScore: number;
  queryPartTypeRaw: string | null;
  candidatePartTypeRaw: string | null;
  queryPartTypeCanonical: string | null;
  candidatePartTypeCanonical: string | null;
  compatibility: PartTypeCompatibility;
  reason: string;
  compatibilityReason: string;
  hardConflicts: string[];
  structuredScore: number;
  aiRerankerCalled: boolean;
  aiRerankerScore: number | null;
  aiRerankerReason: string | null;
  scoreBeforeThreshold: number;
  threshold: number;
  removed: boolean;
  removedByCompatibilityGate: boolean;
  removedAt: string | null;
  removedReason: string | null;
  finalRank: number | null;
};
export type MatchingDiagnostics = {
  query: string;
  parsedQuery: ParsedProductIntent;
  hydration: ProductRetrievalDiagnostics | null;
  candidates: MatchingCandidateDiagnostic[];
};

export type ProductMatchResult = { item: PurchaseDocumentItem; status: MatchStatus; method: Exclude<MatchMethod, "manual">; aiCalled: boolean; normalizedQuery: string; parsedIntent: ParsedProductIntent; candidates: ProductCandidate[]; diagnostics?: MatchingDiagnostics };

export type RerankResult = {
  bestExternalId: string | null;
  confidence: number;
  status: MatchStatus;
  reason: string;
  ranking: Array<{ externalId: string; confidence: number; reason: string }>;
};

export interface ProductCandidateReranker { rerank(input: { item: PurchaseDocumentItem; parsedIntent: ParsedProductIntent; candidates: ProductCandidate[] }): Promise<RerankResult>; }
