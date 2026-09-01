import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function main() {
  const client = createSupabaseAdminClient();
  
  console.log("=".repeat(80));
  console.log("INVESTIGAÇÃO: EMBEDDING INDEXER");
  console.log("=".repeat(80));
  console.log("");

  // Pegar produtos TagPlus que:
  // - não têm embedding
  // - foram atualizados hoje (2026-08-30)
  const { data: products, error } = await client
    .from("erp_products")
    .select("id, external_id, description, search_text, search_text_hash, updated_at, synced_at, embedding_updated_at")
    .eq("provider", "tagplus")
    .is("embedding", null)
    .gte("updated_at", "2026-08-30")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Erro:", error);
    return;
  }

  console.log(`Produtos sem embedding atualizados hoje: ${products?.length ?? 0}`);
  console.log("");

  if (products && products.length > 0) {
    for (const p of products) {
      console.log(`ID: ${p.external_id}`);
      console.log(`  Descrição: ${p.description}`);
      console.log(`  Search text hash: ${p.search_text_hash}`);
      console.log(`  Updated at: ${p.updated_at}`);
      console.log(`  Synced at: ${p.synced_at}`);
      console.log(`  Embedding updated at: ${p.embedding_updated_at ?? "NULL"}`);
      console.log("");
    }
  }

  // Verificar quantos produtos têm embedding_updated_at de hoje
  const { count: withEmbeddingToday } = await client
    .from("erp_products")
    .select("id", { count: "exact", head: true })
    .eq("provider", "tagplus")
    .gte("embedding_updated_at", "2026-08-30");

  console.log(`Produtos com embedding_updated_at de hoje: ${withEmbeddingToday ?? 0}`);
  console.log("");

  // Verificar se há produtos que foram atualizados hoje MAS já têm embedding
  const { count: updatedTodayWithEmbedding } = await client
    .from("erp_products")
    .select("id", { count: "exact", head: true })
    .eq("provider", "tagplus")
    .not("embedding", "is", null)
    .gte("updated_at", "2026-08-30");

  console.log(`Produtos atualizados hoje COM embedding: ${updatedTodayWithEmbedding ?? 0}`);
  console.log("");
}

main().catch((error) => {
  console.error("Erro fatal:", error);
  process.exit(1);
});
