import { MATCHING_CONFIG } from "@/lib/product-matching/config";
import { tryGenerateQueryEmbedding } from "@/lib/product-matching/embeddings";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { normalizeProductDescription, productTokens } from "@/lib/product-matching/normalize";
import { nearReferenceLookupTerms, productReferenceQueries } from "@/lib/product-matching/reference";
import { scoreProductCandidate } from "@/lib/product-matching/score";
import type { ErpProductRecord, ParsedProductIntent, ProductCandidate, ProductRetrievalDiagnostics } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type RetrievalScope = { storeId: string; provider: string };
export type ProductSearchRequest = { scope: RetrievalScope; item: PurchaseDocumentItem; intent: ParsedProductIntent; queryText: string; terms: string[]; references: string[]; queryEmbedding: number[] | null; limit: number };
export interface ProductRetrievalRepository {
  search(request: ProductSearchRequest): Promise<ErpProductRecord[]>;
  getLastDiagnostics?(): ProductRetrievalDiagnostics;
}
type ErpRow = { id: unknown; external_id: unknown; description: unknown; stock: unknown; cost_price: unknown; sale_price: unknown; barcode: unknown; reference: unknown; supplier: unknown; search_text?: unknown; raw_data?: unknown; lexical_score?: unknown; semantic_score?: unknown };
const SELECT = "id, external_id, description, stock, cost_price, sale_price, barcode, reference, supplier, search_text, raw_data";
const TEXTUAL_COLUMNS = ["description", "reference", "supplier", "barcode", "search_text"];
function textualFilter(term: string) { return TEXTUAL_COLUMNS.map((column) => `${column}.ilike.%${term}%`).join(","); }
function nullableNumber(value: unknown): number | null { if (value === null || value === undefined) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function rowToProduct(row: ErpRow): ErpProductRecord { return { productId: String(row.id), externalId: String(row.external_id), description: String(row.description), stock: nullableNumber(row.stock), costPrice: nullableNumber(row.cost_price), salePrice: nullableNumber(row.sale_price), barcode: row.barcode ? String(row.barcode) : null, reference: row.reference ? String(row.reference) : null, supplier: row.supplier ? String(row.supplier) : null, searchText: row.search_text ? String(row.search_text) : null, rawData: row.raw_data, retrievalLexicalScore: nullableNumber(row.lexical_score), retrievalSemanticScore: nullableNumber(row.semantic_score) }; }
export class SupabaseProductRetrievalRepository implements ProductRetrievalRepository {
  getLastDiagnostics(): ProductRetrievalDiagnostics {
    return { source: "supabase", cachedCandidateCount: null, cachedReadError: null, liveAttempted: false, liveSucceeded: null, liveCandidateCount: null, hydrationError: null, cacheWriteError: null };
  }
  async search(request: ProductSearchRequest): Promise<ErpProductRecord[]> {
    const client = createSupabaseAdminClient();
    const scoped = () => client.from("erp_products").select(SELECT).eq("store_id", request.scope.storeId).eq("provider", request.scope.provider);
    const exactReferenceRequests = request.references.length
      ? [scoped().or(request.references.flatMap((reference) => [`reference.eq.${reference}`, `barcode.eq.${reference}`, `search_text.ilike.%${reference}%`, `description.ilike.%${reference}%`]).join(",")).limit(Math.max(request.limit, 30))]
      : [];
    const nearReferenceRequests = request.references.flatMap(nearReferenceLookupTerms).map((reference) => scoped().or(`reference.ilike.%${reference}%,barcode.ilike.%${reference}%,search_text.ilike.%${reference}%,description.ilike.%${reference}%`).limit(Math.max(request.limit, 30)));
    const requests = [...exactReferenceRequests, ...nearReferenceRequests, ...request.terms.slice(0, 8).map((term) => scoped().or(textualFilter(term)).limit(Math.max(request.limit * 2, 30)))];
    const partTypeTerms = productTokens(request.intent.partType ?? "").filter((term) => term.length >= 3);
    if (partTypeTerms.length) { let partTypeQuery = scoped(); for (const term of partTypeTerms) partTypeQuery = partTypeQuery.ilike("search_text", `%${term}%`); requests.push(partTypeQuery.limit(Math.max(request.limit * 2, 30))); }
    const responses = await Promise.all(requests);
    const unique = new Map<string, ErpProductRecord>();
    for (const { data, error } of responses) { if (error) throw new Error("Não foi possível recuperar candidatos do catálogo ERP."); for (const row of (data ?? []) as ErpRow[]) { const product = rowToProduct(row); unique.set(product.productId, product); } }
    if (request.queryEmbedding) { const { data } = await client.rpc("match_erp_products", { match_store_id: request.scope.storeId, match_provider: request.scope.provider, query_text: request.queryText, query_embedding: request.queryEmbedding, match_count: Math.max(request.limit * 2, 30) }); for (const row of (data ?? []) as ErpRow[]) { const product = rowToProduct(row); const previous = unique.get(product.productId); unique.set(product.productId, previous ? { ...previous, retrievalLexicalScore: product.retrievalLexicalScore, retrievalSemanticScore: product.retrievalSemanticScore } : product); } }
    return [...unique.values()];
  }
}
export async function searchProductCandidates(input: { storeId: string; provider: string; item: PurchaseDocumentItem; limit?: number }, repository: ProductRetrievalRepository = new SupabaseProductRetrievalRepository()): Promise<{ intent: ParsedProductIntent; candidates: ProductCandidate[] }> { const limit = Math.min(Math.max(input.limit ?? MATCHING_CONFIG.retrievalLimit, 1), 20); const intent = parseProductIntent(input.item); const queryText = normalizeProductDescription(input.item.description); const terms = productTokens(queryText).filter((token) => token.length >= 3 || /^\d+$/.test(token)); const references = productReferenceQueries(input.item); const queryEmbedding = await tryGenerateQueryEmbedding(queryText); const products = await repository.search({ scope: { storeId: input.storeId, provider: input.provider }, item: input.item, intent, queryText, terms, references, queryEmbedding, limit }); const candidates = products.map((product) => scoreProductCandidate(input.item, product, { intent })).filter((candidate) => candidate.deterministicScore >= MATCHING_CONFIG.minimumCandidateScore).sort((first, second) => Number(second.scoreBreakdown.exactReferenceMatch) - Number(first.scoreBreakdown.exactReferenceMatch) || Number(second.scoreBreakdown.nearReferenceMatch) - Number(first.scoreBreakdown.nearReferenceMatch) || second.deterministicScore - first.deterministicScore).slice(0, limit); return { intent, candidates }; }
export async function retrieveProductCandidates(input: { storeId: string; provider: string; item: PurchaseDocumentItem; limit?: number }, repository?: ProductRetrievalRepository): Promise<ProductCandidate[]> { return (await searchProductCandidates(input, repository)).candidates; }
