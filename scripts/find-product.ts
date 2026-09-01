import { generateDiagnosticEmbeddings, resolveDiagnosticStore, retrieveRawTop30, type DiagnosticProvider } from "@/scripts/retrieval-diagnostics";

async function main() {
  const provider = readArgument("--provider");
  const query = readArgument("--query");
  const requestedLimit = Number(readArgument("--limit") ?? "30");
  if (provider !== "cci" && provider !== "tagplus") throw new Error('--provider deve ser "cci" ou "tagplus".');
  if (!query?.trim()) throw new Error("--query é obrigatório.");
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 30) throw new Error("--limit deve ser um inteiro entre 1 e 30.");

  const typedProvider: DiagnosticProvider = provider;
  const storeId = await resolveDiagnosticStore(typedProvider);
  const [embedding] = await generateDiagnosticEmbeddings([query]);
  const candidates = await retrieveRawTop30({ provider: typedProvider, storeId, query, embedding, limit: requestedLimit });

  console.log(`Busca manual ${typedProvider.toUpperCase()}: ${JSON.stringify(query)}`);
  console.log("Resultados brutos; nenhum produto foi confirmado ou gravado automaticamente.");
  console.table(candidates.map((candidate, index) => ({
    rank: index + 1,
    externalId: candidate.externalId,
    description: candidate.description,
    reference: candidate.reference,
    barcode: candidate.barcode,
    supplier: candidate.supplier,
  })));
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error("Falha na busca manual do catálogo.");
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
    console.error("cause:", error.cause);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
