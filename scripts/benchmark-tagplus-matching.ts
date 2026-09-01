import { parseProductIntent } from "@/lib/product-matching/intent";
import { legacyProductScore } from "@/lib/product-matching/legacy-score";
import { normalizeProductDescription, productTokens } from "@/lib/product-matching/normalize";
import { scoreProductCandidate } from "@/lib/product-matching/score";
import type { ProductSearchRequest } from "@/lib/product-matching/retrieval";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TagPlusProductRetrievalRepository } from "@/lib/tagplus/product-retrieval";

async function main() {
  const supabase = createSupabaseAdminClient();
  const { data: store, error } = await supabase.from("stores").select("id, created_by").eq("provider", "tagplus").limit(1).maybeSingle();
  if (error || !store) throw new Error("Loja TagPlus não encontrada para benchmark.");
  const item = { supplierCode: null, supplierReference: null, description: "CORRENTE COMANDO SHINERAY XY-50Q 82L OSI", quantity: 1, unitCost: 0, total: null };
  const intent = parseProductIntent(item);
  const queryText = normalizeProductDescription(item.description);
  const request: ProductSearchRequest = { scope: { storeId: String(store.id), provider: "tagplus" }, item, intent, queryText, terms: productTokens(queryText), references: [], queryEmbedding: null, limit: 15 };
  const products = await new TagPlusProductRetrievalRepository(String(store.created_by)).search(request);
  const legacy = products.map((product) => ({ externalId: product.externalId, description: product.description, score: legacyProductScore(item, product) })).sort((a, b) => b.score - a.score).slice(0, 5);
  const hybrid = products.map((product) => scoreProductCandidate(item, product, { intent })).sort((a, b) => b.deterministicScore - a.deterministicScore).slice(0, 5).map((candidate) => ({ externalId: candidate.externalId, description: candidate.description, score: candidate.deterministicScore, partTypeConflict: candidate.scoreBreakdown.partTypeConflict }));
  console.log(JSON.stringify({ query: item.description, candidatesRetrieved: products.length, legacy, hybrid }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
