import { generateEmbeddings } from "@/lib/product-matching/embeddings";
import { buildProductSearchText } from "@/lib/product-matching/search-text";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ProductRow = { id: string; external_id: string; description: string; reference: string | null; supplier: string | null; barcode: string | null; raw_data: unknown; search_text: string | null };

export type EmbeddingIndexerMetrics = {
  indexed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  failedIds: string[];
  storeId: string;
  provider: string;
};

export async function indexProductEmbeddings(input: { storeId: string; provider: string; batchSize?: number; maxProducts?: number }): Promise<EmbeddingIndexerMetrics> {
  const batchSize = Math.min(Math.max(input.batchSize ?? 50, 1), 100);
  const maxProducts = Math.max(input.maxProducts ?? Number.POSITIVE_INFINITY, 1);
  const supabase = createSupabaseAdminClient();
  
  const metrics: EmbeddingIndexerMetrics = {
    indexed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    failedIds: [],
    storeId: input.storeId,
    provider: input.provider,
  };

  while (metrics.indexed < maxProducts) {
    const currentBatchSize = Math.min(batchSize, maxProducts - metrics.indexed);
    const { data, error } = await supabase.from("erp_products")
      .select("id, external_id, description, reference, supplier, barcode, raw_data, search_text")
      .eq("store_id", input.storeId)
      .eq("provider", input.provider)
      .or("embedding.is.null,embedding_updated_at.is.null")
      .order("updated_at", { ascending: true })
      .limit(currentBatchSize);
    
    if (error) throw new Error(`[SUPABASE_READ_ERROR] Não foi possível listar produtos sem embedding: ${error.message}`, { cause: error });
    
    const rows = (data ?? []) as ProductRow[];
    if (!rows.length) break;

    // CRITICAL: Usar search_text existente se disponível; caso contrário, construir
    // Isso evita trigger de invalidação de embedding
    const prepared = rows.map((row) => {
      const searchText = row.search_text 
        ?? buildProductSearchText({ description: row.description, reference: row.reference, supplier: row.supplier, barcode: row.barcode, rawData: row.raw_data });
      return { row, searchText };
    });

    // Se algum produto não tem search_text, precisamos criá-lo ANTES de gerar embeddings
    const needsSearchText = prepared.filter(({ row }) => !row.search_text);
    if (needsSearchText.length > 0) {
      console.log(`[INDEXER] ${needsSearchText.length} produtos sem search_text; criando antes de gerar embeddings...`);
      const searchTextUpdates = await Promise.all(
        needsSearchText.map(({ row, searchText }) => 
          supabase.from("erp_products").update({ search_text: searchText }).eq("id", row.id)
        )
      );
      const searchTextFailure = searchTextUpdates.find((result) => result.error)?.error;
      if (searchTextFailure) {
        console.error(`[INDEXER_ERROR] Falha ao criar search_text: ${searchTextFailure.message}`);
        throw new Error(`[SUPABASE_WRITE_ERROR] Não foi possível criar search_text: ${searchTextFailure.message}`, { cause: searchTextFailure });
      }
    }

    // Gerar embeddings
    let vectors: number[][];
    try {
      vectors = await generateEmbeddings(prepared.map((entry) => entry.searchText));
      console.log(`[INDEXER] Gerados ${vectors.length} embeddings para batch de ${prepared.length} produtos`);
    } catch (error) {
      console.error(`[INDEXER_ERROR] Falha ao gerar embeddings:`, error);
      metrics.failed += prepared.length;
      metrics.failedIds.push(...prepared.map(({ row }) => row.external_id));
      metrics.indexed += prepared.length;
      continue;
    }

    // Salvar embeddings individualmente com tratamento de erro granular
    const updatedAt = new Date().toISOString();
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < prepared.length; i++) {
      const { row } = prepared[i];
      const vector = vectors[i];
      
      try {
        const { error: embeddingError } = await supabase
          .from("erp_products")
          .update({ embedding: vector, embedding_updated_at: updatedAt })
          .eq("id", row.id);
        
        if (embeddingError) {
          console.error(`[INDEXER_ERROR] Falha ao salvar embedding para produto ${row.external_id}:`, embeddingError.message);
          metrics.failedIds.push(row.external_id);
          failCount++;
        } else {
          successCount++;
        }
      } catch (error) {
        console.error(`[INDEXER_ERROR] Exceção ao salvar embedding para produto ${row.external_id}:`, error);
        metrics.failedIds.push(row.external_id);
        failCount++;
      }
    }

    metrics.succeeded += successCount;
    metrics.failed += failCount;
    metrics.indexed += rows.length;

    console.log(`[INDEXER] Batch completo: ${successCount} sucessos, ${failCount} falhas de ${rows.length} produtos`);

    if (rows.length < currentBatchSize) break;
  }

  console.log(`[INDEXER] Indexação finalizada: ${metrics.succeeded} sucessos, ${metrics.failed} falhas, ${metrics.skipped} pulados de ${metrics.indexed} produtos processados`);
  
  if (metrics.failed > 0) {
    console.error(`[INDEXER] ${metrics.failed} produtos falharam. IDs (primeiros 20):`, metrics.failedIds.slice(0, 20));
  }

  return metrics;
}
