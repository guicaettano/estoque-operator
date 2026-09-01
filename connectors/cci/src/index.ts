import { loadConfig, loadEnvFile } from "./config";
import { connectToFirebird, readCciProducts } from "./firebird";
import { normalizeCciProduct } from "./normalize";
import { syncProductBatches } from "./sync";

async function main() {
  const startedAt = performance.now();
  loadEnvFile();
  const config = loadConfig();

  console.log("CCI Connector\n");
  console.log("Connecting to Firebird...");
  const database = await connectToFirebird(config.firebird);
  console.log("✓ Connected\n");

  try {
    console.log("Reading CADASTRODESCRICAO...");
    const rows = await readCciProducts(database);
    const products = rows.map(normalizeCciProduct);
    console.log(`✓ ${formatNumber(products.length)} products found\n`);

    console.log("Syncing with estoque-operator...");
    const summary = await syncProductBatches({
      products,
      storeId: config.storeId,
      syncUrl: config.syncUrl,
      connectorToken: config.connectorToken,
      batchSize: config.batchSize,
      requestTimeoutMs: config.requestTimeoutMs,
    });
    console.log(`✓ ${formatNumber(summary.upserted)} products synchronized\n`);
    console.log(`Completed in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
  } finally {
    await database.detachAsync();
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(`\nCCI Connector failed: ${message}`);
  process.exitCode = 1;
});
