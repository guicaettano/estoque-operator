import { indexProductEmbeddings } from "@/lib/product-matching/embedding-indexer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretValues = Object.entries(process.env)
  .filter(([name, value]) => Boolean(value) && /(?:API_KEY|SERVICE_ROLE|TOKEN|SECRET|PASSWORD)$/i.test(name))
  .map(([, value]) => value as string);

async function main() {
  const storeId = process.env.MATCH_INDEX_STORE_ID;
  const provider = process.env.MATCH_INDEX_PROVIDER;
  if (!storeId || !UUID.test(storeId)) throw new Error("MATCH_INDEX_STORE_ID deve ser o UUID da loja.");
  if (!provider) throw new Error("MATCH_INDEX_PROVIDER deve ser cci ou tagplus.");
  const result = await indexProductEmbeddings({
    storeId,
    provider,
    batchSize: Number(process.env.MATCH_INDEX_BATCH_SIZE || 50),
    maxProducts: process.env.MATCH_INDEX_MAX_PRODUCTS ? Number(process.env.MATCH_INDEX_MAX_PRODUCTS) : undefined,
  });
  console.log(`\n=== RESULTADO DA INDEXAÇÃO ===`);
  console.log(`Provider: ${result.provider}`);
  console.log(`Loja: ${result.storeId}`);
  console.log(`Produtos processados: ${result.indexed}`);
  console.log(`Sucessos: ${result.succeeded}`);
  console.log(`Falhas: ${result.failed}`);
  console.log(`Pulados: ${result.skipped}`);
  
  if (result.failed > 0) {
    console.log(`\nProdutos que falharam (primeiros 20):`);
    console.log(result.failedIds.slice(0, 20).join(", "));
  }
  
  if (result.failed > 0) {
    console.error(`\n⚠️  ATENÇÃO: ${result.failed} produtos não foram indexados.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✅ Todos os ${result.succeeded} produtos foram indexados com sucesso.`);
  }
}

main().catch((error) => {
  console.error("Falha ao gerar embeddings.");
  if (error instanceof Error) {
    console.error(redactSecrets(error.message));
    console.error(redactSecrets(error.stack));
    console.error("cause:", redactSecrets(error.cause));
  } else {
    console.error(redactSecrets(error));
  }
  process.exitCode = 1;
});

function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return secretValues.reduce((result, secret) => result.replaceAll(secret, "[REDACTED]"), value);
  if (value instanceof Error) return { name: value.name, message: redactSecrets(value.message), stack: redactSecrets(value.stack), cause: redactSecrets(value.cause) };
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSecrets(item)]));
  return value;
}
