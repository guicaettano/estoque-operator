import { getErpProductCoverage, syncTagPlusCatalog } from "@/lib/tagplus/catalog-sync";
import { resolveDiagnosticStore } from "@/scripts/retrieval-diagnostics";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const configuredStoreId = process.env.TAGPLUS_CATALOG_STORE_ID;
  if (configuredStoreId && !UUID.test(configuredStoreId)) throw new Error("TAGPLUS_CATALOG_STORE_ID deve ser o UUID da loja TagPlus.");
  const storeId = configuredStoreId ?? await resolveDiagnosticStore("tagplus");
  const metrics = await syncTagPlusCatalog({ storeId }, { log: (message) => console.log(message) });
  const coverage = await getErpProductCoverage();
  const tagPlusCoverage = coverage.find((entry) => entry.provider === "tagplus");
  if (tagPlusCoverage && tagPlusCoverage.coveragePercentage < 99) {
    console.warn(`[EMBEDDING_COVERAGE_WARNING] TagPlus com ${tagPlusCoverage.coveragePercentage}% de cobertura: ${tagPlusCoverage.indexedProducts}/${tagPlusCoverage.totalProducts}; faltando ${tagPlusCoverage.missingEmbeddings}.`);
  }
  console.log(JSON.stringify({
    title: "TagPlus full catalog sync",
    pages: metrics.pagesFetched,
    fetched: metrics.productsFetched,
    upserted: metrics.productsUpserted,
    durationMs: metrics.durationMs,
    durationSeconds: Number((metrics.durationMs / 1000).toFixed(1)),
    coverage,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
