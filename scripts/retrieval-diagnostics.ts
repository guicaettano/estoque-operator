import { generateEmbeddings } from "@/lib/product-matching/embeddings";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type DiagnosticProvider = "cci" | "tagplus";

export type RawRetrievalCandidate = {
  externalId: string;
  description: string;
  reference: string | null;
  barcode: string | null;
  supplier: string | null;
  lexicalScore: number;
  semanticScore: number;
  combinedRetrievalScore: number;
};

type RawRpcRow = {
  external_id: unknown;
  description: unknown;
  reference: unknown;
  barcode: unknown;
  supplier: unknown;
  lexical_score: unknown;
  semantic_score: unknown;
};

const STORE_ENV: Record<DiagnosticProvider, string[]> = {
  cci: ["MATCH_BENCHMARK_STORE_ID", "CCI_STORE_ID"],
  tagplus: ["MATCH_TAGPLUS_STORE_ID", "TAGPLUS_CATALOG_STORE_ID"],
};

export async function resolveDiagnosticStore(provider: DiagnosticProvider): Promise<string> {
  const configured = STORE_ENV[provider].map((name) => process.env[name]).find(Boolean);
  const client = createSupabaseAdminClient();

  if (configured) {
    const { data, error } = await client.from("stores").select("id, provider").eq("id", configured).maybeSingle();
    if (error) throw new Error(`[SUPABASE_READ_ERROR] Falha ao validar loja ${provider}: ${error.message}`);
    if (!data || data.provider !== provider) {
      throw new Error(`A loja configurada para ${provider} não existe ou pertence a outro provider.`);
    }
    return String(data.id);
  }

  const { data, error } = await client.from("stores").select("id").eq("provider", provider).limit(2);
  if (error) throw new Error(`[SUPABASE_READ_ERROR] Falha ao localizar loja ${provider}: ${error.message}`);
  if (data?.length !== 1) {
    throw new Error(`Não foi possível escolher uma única loja ${provider}. Configure ${STORE_ENV[provider][0]} em .env.local.`);
  }
  return String(data[0].id);
}

export async function generateDiagnosticEmbeddings(queries: string[]): Promise<number[][]> {
  return generateEmbeddings(queries.map(normalizeProductDescription));
}

export async function retrieveRawTop30(input: {
  provider: DiagnosticProvider;
  storeId: string;
  query: string;
  embedding: number[];
  limit?: number;
}): Promise<RawRetrievalCandidate[]> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 30);
  const { data, error } = await createSupabaseAdminClient().rpc("match_erp_products", {
    match_store_id: input.storeId,
    match_provider: input.provider,
    query_text: normalizeProductDescription(input.query),
    query_embedding: input.embedding,
    match_count: limit,
  });
  if (error) throw new Error(`[SUPABASE_READ_ERROR] Retrieval ${input.provider} falhou: ${error.message}`);

  return ((data ?? []) as RawRpcRow[]).map((row) => {
    const lexicalScore = Number(row.lexical_score ?? 0);
    const semanticScore = Number(row.semantic_score ?? 0);
    return {
      externalId: String(row.external_id),
      description: String(row.description ?? ""),
      reference: nullableString(row.reference),
      barcode: nullableString(row.barcode),
      supplier: nullableString(row.supplier),
      lexicalScore,
      semanticScore,
      combinedRetrievalScore: lexicalScore * 0.55 + semanticScore * 0.45,
    };
  });
}

export async function loadCatalogCoverage(provider: DiagnosticProvider, storeId: string) {
  const client = createSupabaseAdminClient();
  const [total, indexed] = await Promise.all([
    client.from("erp_products").select("id", { count: "exact", head: true }).eq("provider", provider).eq("store_id", storeId),
    client.from("erp_products").select("id", { count: "exact", head: true }).eq("provider", provider).eq("store_id", storeId).not("embedding", "is", null),
  ]);
  if (total.error || indexed.error) {
    throw new Error(`[SUPABASE_READ_ERROR] Falha ao contar catálogo ${provider}: ${total.error?.message ?? indexed.error?.message}`);
  }
  return { total: total.count ?? 0, indexed: indexed.count ?? 0 };
}

export async function findExactCatalogProduct(provider: DiagnosticProvider, storeId: string, externalId: string) {
  const { data, error } = await createSupabaseAdminClient().from("erp_products")
    .select("external_id, description, reference, barcode, supplier")
    .eq("provider", provider)
    .eq("store_id", storeId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(`[SUPABASE_READ_ERROR] Falha ao verificar ${provider} #${externalId}: ${error.message}`);
  if (!data) return null;
  return {
    externalId: String(data.external_id),
    description: String(data.description ?? ""),
    reference: nullableString(data.reference),
    barcode: nullableString(data.barcode),
    supplier: nullableString(data.supplier),
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}
