import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  calculateRecall,
  interpretRecallAt30,
  providerGold,
  RECALL_KS,
  validateGoldDataset,
  type RecallK,
} from "@/scripts/retrieval-benchmark-core";
import {
  findExactCatalogProduct,
  generateDiagnosticEmbeddings,
  loadCatalogCoverage,
  resolveDiagnosticStore,
  retrieveRawTop30,
  type DiagnosticProvider,
  type RawRetrievalCandidate,
} from "@/scripts/retrieval-diagnostics";
import { osiasMatchingGold, type MatchingGoldItem, type RetrievalCaseCategory } from "@/tests/fixtures/osias-matching-gold";

type ConfirmedCase = {
  supplierCode: string;
  description: string;
  category: RetrievalCaseCategory;
  correctExternalId: string;
  correctDescription: string | null;
  rankInRetrieval: number | null;
  top10: RawRetrievalCandidate[];
};

type ProviderBenchmark = {
  provider: DiagnosticProvider;
  coverage: { total: number; indexed: number };
  recall: Record<RecallK, number | null>;
  confirmed: ConfirmedCase[];
  unverified: MatchingGoldItem[];
  notInCatalog: MatchingGoldItem[];
  categoryCounts: Map<RetrievalCaseCategory, number>;
  interpretation: string;
};

async function main() {
  validateGoldDataset(osiasMatchingGold);
  const providers: DiagnosticProvider[] = ["cci", "tagplus"];
  const stores = Object.fromEntries(await Promise.all(providers.map(async (provider) => [provider, await resolveDiagnosticStore(provider)]))) as Record<DiagnosticProvider, string>;
  const confirmedDescriptions = [...new Set(osiasMatchingGold.flatMap((item) => providers.some((provider) => providerGold(item, provider).status === "CONFIRMED") ? [item.description] : []))];
  const vectors = await generateDiagnosticEmbeddings(confirmedDescriptions);
  const embeddingByDescription = new Map(confirmedDescriptions.map((description, index) => [description, vectors[index]]));

  const results: ProviderBenchmark[] = [];
  for (const provider of providers) {
    results.push(await benchmarkProvider(provider, stores[provider], embeddingByDescription));
  }

  printTerminal(results);
  const reportPath = path.join(process.cwd(), "reports", "osias-retrieval-benchmark.md");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderMarkdown(results), "utf8");
  console.log(`\nRelatório: ${reportPath}`);
}

async function benchmarkProvider(
  provider: DiagnosticProvider,
  storeId: string,
  embeddings: Map<string, number[]>,
): Promise<ProviderBenchmark> {
  const coverage = await loadCatalogCoverage(provider, storeId);
  const confirmed: ConfirmedCase[] = [];
  const unverified: MatchingGoldItem[] = [];
  const notInCatalog: MatchingGoldItem[] = [];
  const categoryCounts = new Map<RetrievalCaseCategory, number>();

  for (const item of osiasMatchingGold) {
    const gold = providerGold(item, provider);
    categoryCounts.set(gold.category, (categoryCounts.get(gold.category) ?? 0) + 1);
    if (gold.status === "UNVERIFIED") {
      unverified.push(item);
      continue;
    }
    if (gold.status === "NOT_IN_CATALOG") {
      notInCatalog.push(item);
      continue;
    }

    const embedding = embeddings.get(item.description);
    if (!embedding || !gold.correctExternalId) throw new Error(`Gold confirmado sem embedding/ID: ${item.supplierCode}/${provider}.`);
    const candidates = await retrieveRawTop30({ provider, storeId, query: item.description, embedding, limit: 30 });
    const index = candidates.findIndex((candidate) => candidate.externalId === gold.correctExternalId);
    const exact = await findExactCatalogProduct(provider, storeId, gold.correctExternalId);
    confirmed.push({
      supplierCode: item.supplierCode,
      description: item.description,
      category: gold.category,
      correctExternalId: gold.correctExternalId,
      correctDescription: index >= 0 ? candidates[index].description : exact?.description ?? null,
      rankInRetrieval: index >= 0 ? index + 1 : null,
      top10: index < 0 || index >= 3 ? candidates.slice(0, 10) : [],
    });
  }

  const recall = calculateRecall(confirmed);
  return {
    provider,
    coverage,
    recall,
    confirmed,
    unverified,
    notInCatalog,
    categoryCounts,
    interpretation: interpretRecallAt30(recall[30]),
  };
}

function printTerminal(results: ProviderBenchmark[]) {
  console.log("OSIAS raw retrieval benchmark (lexical + semantic, Top 30 bruto)");
  console.log("Sem reranker, compatibility gate, threshold, UI confidence ou decisão final.\n");
  for (const result of results) {
    console.log(`=== ${result.provider.toUpperCase()} ===`);
    console.log(`Catálogo: ${result.coverage.total} produtos; embeddings: ${result.coverage.indexed}`);
    console.log(`Confirmados: ${result.confirmed.length}; UNVERIFIED: ${result.unverified.length}; NOT_IN_CATALOG: ${result.notInCatalog.length}`);
    console.log(RECALL_KS.map((k) => `Recall@${k}: ${formatRecall(result.recall[k], result.confirmed.length)}`).join(" | "));
    for (const item of result.confirmed) {
      console.log(`\n${item.supplierCode} | ${item.description}`);
      console.log(`provider=${result.provider} correctExternalId=${item.correctExternalId} correctDescription=${item.correctDescription ?? "NOT_FOUND_IN_CATALOG"} rankInRetrieval=${item.rankInRetrieval ?? "NOT_FOUND_TOP_30"}`);
      if (item.top10.length) {
        console.log("Top 10 bruto:");
        console.table(item.top10.map((candidate, index) => ({
          rank: index + 1,
          externalId: candidate.externalId,
          description: candidate.description,
          lexicalScore: round(candidate.lexicalScore),
          semanticScore: round(candidate.semanticScore),
          combinedRetrievalScore: round(candidate.combinedRetrievalScore),
        })));
      }
    }
    console.log(`\n${result.interpretation}\n`);
  }
}

function renderMarkdown(results: ProviderBenchmark[]): string {
  const lines = [
    "# OSIAS retrieval benchmark",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Pipeline measured: normalized query → existing lexical + semantic RPC → raw Top 30. No reranker, compatibility gate, final threshold, UI confidence, or NO_CONFIDENT_MATCH decision was applied.",
    "",
    "## Summary",
    "",
    "| Provider | Catalog | Indexed | Confirmed | Recall@1 | Recall@3 | Recall@5 | Recall@10 | Recall@20 | Recall@30 | Outside Top 30 | UNVERIFIED | NOT_IN_CATALOG |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...results.map((result) => `| ${result.provider.toUpperCase()} | ${result.coverage.total} | ${result.coverage.indexed} | ${result.confirmed.length} | ${RECALL_KS.map((k) => formatRecall(result.recall[k], result.confirmed.length)).join(" | ")} | ${result.confirmed.filter((item) => item.rankInRetrieval === null).length} | ${result.unverified.length} | ${result.notInCatalog.length} |`),
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.provider.toUpperCase()}`, "", `Decision: ${result.interpretation}`, "", "### Confirmed cases", "");
    if (!result.confirmed.length) {
      lines.push("No manually confirmed IDs; Recall@K is N/A.", "");
    } else {
      lines.push("| supplierCode | Description | Category | Correct ID | Correct description | Raw rank |", "| --- | --- | --- | --- | --- | ---: |");
      for (const item of result.confirmed) {
        lines.push(`| ${item.supplierCode} | ${escapeCell(item.description)} | ${item.category} | ${item.correctExternalId} | ${escapeCell(item.correctDescription ?? "NOT_FOUND_IN_CATALOG")} | ${item.rankInRetrieval ?? "NOT_FOUND_TOP_30"} |`);
      }
      lines.push("");
    }

    lines.push("### Errors outside Top 3", "");
    const errors = result.confirmed.filter((item) => item.rankInRetrieval === null || item.rankInRetrieval > 3);
    if (!errors.length) lines.push("None.", "");
    for (const item of errors) {
      lines.push(`#### ${item.supplierCode} — ${item.description}`, "", `Correct: #${item.correctExternalId}; rank: ${item.rankInRetrieval ?? "NOT_FOUND_TOP_30"}`, "", "| Rank | externalId | Description | lexicalScore | semanticScore | combinedRetrievalScore |", "| ---: | --- | --- | ---: | ---: | ---: |");
      for (const [index, candidate] of item.top10.entries()) {
        lines.push(`| ${index + 1} | ${candidate.externalId} | ${escapeCell(candidate.description)} | ${round(candidate.lexicalScore)} | ${round(candidate.semanticScore)} | ${round(candidate.combinedRetrievalScore)} |`);
      }
      lines.push("");
    }

    lines.push("### Effective category inventory", "", "| Category | Cases |", "| --- | ---: |");
    for (const [category, count] of [...result.categoryCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) lines.push(`| ${category} | ${count} |`);
    lines.push("", `### UNVERIFIED (${result.unverified.length})`, "", ...renderItemList(result.unverified), "", `### NOT_IN_CATALOG (${result.notInCatalog.length})`, "", ...renderItemList(result.notInCatalog), "");
  }
  return `${lines.join("\n")}\n`;
}

function renderItemList(items: MatchingGoldItem[]): string[] {
  return items.length ? items.map((item) => `- ${item.supplierCode} — ${item.description}`) : ["None."];
}

function formatRecall(value: number | null, denominator: number): string {
  if (value === null) return "N/A";
  return `${Math.round(value * denominator)}/${denominator} (${(value * 100).toFixed(1)}%)`;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error("Falha no benchmark de retrieval OSIAS.");
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
      console.error("cause:", error.cause);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
}
