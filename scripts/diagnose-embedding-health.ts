import { getErpProductCoverage } from "@/lib/tagplus/catalog-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function main() {
  console.log("=".repeat(80));
  console.log("DIAGNÓSTICO DE SAÚDE DOS EMBEDDINGS");
  console.log("=".repeat(80));
  console.log("");

  const coverage = await getErpProductCoverage();

  console.log("COBERTURA ATUAL:");
  console.log("");
  for (const provider of coverage) {
    console.log(`${provider.provider.toUpperCase()}:`);
    console.log(`  Total de produtos: ${provider.totalProducts}`);
    console.log(`  Produtos indexados: ${provider.indexedProducts}`);
    console.log(`  Embeddings faltando: ${provider.missingEmbeddings}`);
    console.log(`  Cobertura: ${provider.coveragePercentage}%`);
    console.log("");
  }

  const tagPlus = coverage.find((c) => c.provider === "tagplus");
  const cci = coverage.find((c) => c.provider === "cci");

  if (tagPlus && tagPlus.missingEmbeddings > 0) {
    console.log("=".repeat(80));
    console.log("INVESTIGAÇÃO: PRODUTOS TAGPLUS SEM EMBEDDING");
    console.log("=".repeat(80));
    console.log("");

    const client = createSupabaseAdminClient();
    const { data: missing, error } = await client
      .from("erp_products")
      .select("external_id, description, search_text, search_text_hash, updated_at, synced_at, embedding_updated_at")
      .eq("provider", "tagplus")
      .is("embedding", null)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Erro ao consultar produtos sem embedding:", error);
    } else if (missing && missing.length > 0) {
      console.log(`Total sem embedding: ${missing.length} (mostrando até 100 mais recentes)`);
      console.log("");

      const grouped = new Map<string, number>();
      const byDate = new Map<string, number>();

      for (const product of missing) {
        const date = product.updated_at ? product.updated_at.split("T")[0] : "sem_data";
        byDate.set(date, (byDate.get(date) ?? 0) + 1);

        if (grouped.size < 10) {
          const key = product.external_id;
          grouped.set(key, (grouped.get(key) ?? 0) + 1);
        }
      }

      console.log("EXEMPLOS DE PRODUTOS SEM EMBEDDING (até 10):");
      let count = 0;
      for (const product of missing) {
        if (count >= 10) break;
        console.log(`  ID: ${product.external_id}`);
        console.log(`    Descrição: ${product.description || "N/A"}`);
        console.log(`    Search text: ${product.search_text?.substring(0, 80) || "N/A"}${product.search_text && product.search_text.length > 80 ? "..." : ""}`);
        console.log(`    Search text hash: ${product.search_text_hash || "N/A"}`);
        console.log(`    Updated at: ${product.updated_at || "N/A"}`);
        console.log(`    Synced at: ${product.synced_at || "N/A"}`);
        console.log(`    Embedding updated at: ${product.embedding_updated_at || "N/A"}`);
        console.log("");
        count++;
      }

      console.log("DISTRIBUIÇÃO TEMPORAL (por data de updated_at):");
      const sortedDates = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [date, count] of sortedDates) {
        console.log(`  ${date}: ${count} produtos`);
      }
      console.log("");
    } else {
      console.log("Nenhum produto TagPlus sem embedding encontrado.");
    }
  }

  if (cci && cci.missingEmbeddings > 0) {
    console.log("=".repeat(80));
    console.log("INVESTIGAÇÃO: PRODUTOS CCI SEM EMBEDDING");
    console.log("=".repeat(80));
    console.log("");

    const client = createSupabaseAdminClient();
    const { data: missing, error } = await client
      .from("erp_products")
      .select("external_id, description, search_text, search_text_hash, updated_at, synced_at, embedding_updated_at")
      .eq("provider", "cci")
      .is("embedding", null)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Erro ao consultar produtos CCI sem embedding:", error);
    } else if (missing && missing.length > 0) {
      console.log(`Exemplos (até 10):`);
      for (const product of missing) {
        console.log(`  ID: ${product.external_id} - ${product.description || "N/A"}`);
      }
    } else {
      console.log("Nenhum produto CCI sem embedding encontrado.");
    }
  }

  console.log("=".repeat(80));
  console.log("RESUMO:");
  console.log("=".repeat(80));
  console.log("");
  
  const hasIssues = (tagPlus && tagPlus.coveragePercentage < 99) || (cci && cci.coveragePercentage < 99);
  
  if (hasIssues) {
    console.log("❌ PROBLEMAS DETECTADOS:");
    if (tagPlus && tagPlus.coveragePercentage < 99) {
      console.log(`   - TagPlus com cobertura baixa: ${tagPlus.coveragePercentage}%`);
    }
    if (cci && cci.coveragePercentage < 99) {
      console.log(`   - CCI com cobertura baixa: ${cci.coveragePercentage}%`);
    }
    console.log("");
    console.log("⚠️  NÃO execute benchmarks finais até restaurar 100% de cobertura.");
  } else {
    console.log("✅ Índices saudáveis:");
    console.log(`   - TagPlus: ${tagPlus?.coveragePercentage}%`);
    console.log(`   - CCI: ${cci?.coveragePercentage}%`);
    console.log("");
    console.log("✅ Sistema pronto para benchmarks.");
  }
  console.log("");
}

main().catch((error) => {
  console.error("Erro fatal:", error);
  process.exit(1);
});
