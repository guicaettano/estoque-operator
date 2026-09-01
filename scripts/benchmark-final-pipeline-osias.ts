import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import { buildProductMatchInput } from "@/lib/product-matching/input";
import type { ErpProductRecord, ProductMatchResult } from "@/lib/product-matching/types";
import type { ProductRetrievalRepository } from "@/lib/product-matching/retrieval";
import { calculateRecall, providerGold, RECALL_KS, validateGoldDataset } from "@/scripts/retrieval-benchmark-core";
import { generateDiagnosticEmbeddings, resolveDiagnosticStore, retrieveRawTop30, type DiagnosticProvider, type RawRetrievalCandidate } from "@/scripts/retrieval-diagnostics";
import { osiasMatchingGold } from "@/tests/fixtures/osias-matching-gold";

type BenchmarkRow = {
  provider: DiagnosticProvider;
  supplierCode: string;
  description: string;
  expectedExternalId: string;
  rawRank: number | null;
  finalRank: number | null;
  finalStatus: ProductMatchResult["status"];
  finalMethod: ProductMatchResult["method"];
  finalCandidates: Array<{ externalId: string; description: string; finalScore: number }>;
  diagnostics: ProductMatchResult["diagnostics"];
};

const REGRESSION_EXPECTATIONS = [
  { provider: "tagplus" as const, supplierCode: "6396", expectedCandidate: "6491", label: "temporary expectedCandidate; official gold unchanged" },
  { provider: "tagplus" as const, supplierCode: "24112", expectedCandidate: "5913", label: "reparo pinca" },
  { provider: "tagplus" as const, supplierCode: "27316", expectedCandidate: "5354", label: "chave luz 2000" },
  { provider: "tagplus" as const, supplierCode: "45377", expectedCandidate: "2973", label: "interruptor partida YBR 02/05" },
  { provider: "tagplus" as const, supplierCode: "45378", expectedCandidate: "2973", label: "interruptor partida YBR 06/13" },
  { provider: "cci" as const, supplierCode: "32360", expectedCandidate: "2023", label: "eixo abre patim" },
  { provider: "cci" as const, supplierCode: "29841", expectedCandidate: "2652", label: "guia corrente tracao" },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY é obrigatória para o benchmark do pipeline final.");
  validateGoldDataset(osiasMatchingGold);
  const stores = {
    cci: await resolveDiagnosticStore("cci"),
    tagplus: await resolveDiagnosticStore("tagplus"),
  };
  const embeddings = await generateDiagnosticEmbeddings(osiasMatchingGold.map((item) => item.description));
  const rows: BenchmarkRow[] = [];

  for (const provider of ["cci", "tagplus"] as const) {
    for (const [index, gold] of osiasMatchingGold.entries()) {
      const expected = providerGold(gold, provider);
      if (expected.status !== "CONFIRMED" || !expected.correctExternalId) continue;
      const raw = await retrieveRawTop30({ provider, storeId: stores[provider], query: gold.description, embedding: embeddings[index] });
      const repository = fixedRawRepository(provider, raw);
      const item = buildProductMatchInput({ supplierCode: gold.supplierCode, supplierReference: null, description: gold.description, quantity: 1, unitCost: 0, total: null });
      const result = await matchPurchaseDocumentItem({ storeId: stores[provider], provider, item, queryEmbedding: embeddings[index] }, { repository });
      rows.push({
        provider,
        supplierCode: gold.supplierCode,
        description: gold.description,
        expectedExternalId: expected.correctExternalId,
        rawRank: rank(raw, expected.correctExternalId),
        finalRank: rank(result.candidates, expected.correctExternalId),
        finalStatus: result.status,
        finalMethod: result.method,
        finalCandidates: result.candidates.map((candidate) => ({ externalId: candidate.externalId, description: candidate.description, finalScore: candidate.finalScore })),
        diagnostics: result.diagnostics,
      });
      console.log(provider + " " + gold.supplierCode + ": raw=" + (rank(raw, expected.correctExternalId) ?? "-") + " final=" + (rank(result.candidates, expected.correctExternalId) ?? "-") + " status=" + result.status);
    }
  }

  const regressionResults = new Map<string, { finalRank: number | null; finalStatus: ProductMatchResult["status"] }>();
  for (const fixture of REGRESSION_EXPECTATIONS) {
    const key = fixture.provider + ":" + fixture.supplierCode;
    const evaluated = rows.find((entry) => entry.provider === fixture.provider && entry.supplierCode === fixture.supplierCode);
    if (evaluated) {
      regressionResults.set(key, { finalRank: rank(evaluated.finalCandidates, fixture.expectedCandidate), finalStatus: evaluated.finalStatus });
      continue;
    }
    const goldIndex = osiasMatchingGold.findIndex((item) => item.supplierCode === fixture.supplierCode);
    if (goldIndex < 0) throw new Error("Item de regressão inexistente: " + fixture.supplierCode);
    const gold = osiasMatchingGold[goldIndex];
    const raw = await retrieveRawTop30({ provider: fixture.provider, storeId: stores[fixture.provider], query: gold.description, embedding: embeddings[goldIndex] });
    const item = buildProductMatchInput({ supplierCode: gold.supplierCode, supplierReference: null, description: gold.description, quantity: 1, unitCost: 0, total: null });
    const result = await matchPurchaseDocumentItem({ storeId: stores[fixture.provider], provider: fixture.provider, item, queryEmbedding: embeddings[goldIndex] }, { repository: fixedRawRepository(fixture.provider, raw) });
    regressionResults.set(key, { finalRank: rank(result.candidates, fixture.expectedCandidate), finalStatus: result.status });
    console.log("regression " + fixture.provider + " " + fixture.supplierCode + ": final=" + (rank(result.candidates, fixture.expectedCandidate) ?? "-") + " status=" + result.status);
  }
  const regressionCases = REGRESSION_EXPECTATIONS.map((fixture) => {
    const result = regressionResults.get(fixture.provider + ":" + fixture.supplierCode);
    if (!result) throw new Error("Resultado de regressão ausente: " + fixture.provider + "/" + fixture.supplierCode);
    return { ...fixture, ...result, passed: result.finalRank !== null && result.finalStatus !== "NO_CONFIDENT_MATCH" };
  });
  const report = {
    generatedAt: new Date().toISOString(),
    methodology: "Raw Top 30 fixo (RPC lexical + pgvector) alimenta compatibility, structured scoring, OpenAI reranker, guardrail e final Top 3. Hidratação live é validada separadamente.",
    providers: Object.fromEntries((["cci", "tagplus"] as const).map((provider) => {
      const providerRows = rows.filter((row) => row.provider === provider);
      return [provider, {
        evaluated: providerRows.length,
        rawRecall: recall(providerRows, "rawRank"),
        finalRecall: recall(providerRows, "finalRank"),
        noConfidentMatch: providerRows.filter((row) => row.finalStatus === "NO_CONFIDENT_MATCH").length,
      }];
    })),
    regressionCases,
    rows,
  };
  const reportDirectory = path.resolve("reports");
  await mkdir(reportDirectory, { recursive: true });
  const jsonPath = path.join(reportDirectory, "osias-final-pipeline-benchmark.json");
  const markdownPath = path.join(reportDirectory, "osias-final-pipeline-benchmark.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(markdownPath, markdown(report), "utf8");
  console.log("Relatórios: " + markdownPath + " | " + jsonPath);
  if (regressionCases.some((entry) => !entry.passed)) process.exitCode = 1;
}

function fixedRawRepository(provider: DiagnosticProvider, candidates: RawRetrievalCandidate[]): ProductRetrievalRepository {
  const products: ErpProductRecord[] = candidates.map((candidate) => ({
    productId: provider + ":" + candidate.externalId,
    externalId: candidate.externalId,
    description: candidate.description,
    stock: null,
    costPrice: null,
    salePrice: null,
    barcode: candidate.barcode,
    reference: candidate.reference,
    supplier: candidate.supplier,
    retrievalLexicalScore: candidate.lexicalScore,
    retrievalSemanticScore: candidate.semanticScore,
  }));
  return { search: async () => products };
}

function rank(candidates: Array<{ externalId: string }>, externalId: string): number | null {
  const index = candidates.findIndex((candidate) => candidate.externalId === externalId);
  return index < 0 ? null : index + 1;
}

function recall(rows: BenchmarkRow[], field: "rawRank" | "finalRank") {
  return calculateRecall(rows.map((row) => ({ supplierCode: row.supplierCode, rankInRetrieval: row[field] })));
}

function percent(value: number | null) {
  return value === null ? "—" : (value * 100).toFixed(1) + "%";
}

function markdown(report: {
  generatedAt: string;
  providers: Record<string, { evaluated: number; rawRecall: Record<number, number | null>; finalRecall: Record<number, number | null>; noConfidentMatch: number }>;
  regressionCases: Array<{ provider: string; supplierCode: string; expectedCandidate: string; finalRank: number | null; finalStatus: string; passed: boolean }>;
}) {
  const lines = ["# OSIAS final-pipeline benchmark", "", "Generated: " + report.generatedAt, ""];
  for (const provider of ["cci", "tagplus"]) {
    const metrics = report.providers[provider];
    lines.push("## " + provider.toUpperCase(), "", "Evaluated: " + metrics.evaluated, "", "| K | Raw Recall | Final Recall |", "|---:|---:|---:|");
    for (const k of RECALL_KS) lines.push("| " + k + " | " + percent(metrics.rawRecall[k]) + " | " + percent(metrics.finalRecall[k]) + " |");
    lines.push("", "NO_CONFIDENT_MATCH: " + metrics.noConfidentMatch, "");
  }
  lines.push("## Regression cases", "", "| Provider | Code | Expected | Final rank | Status | Result |", "|---|---|---:|---:|---|---|");
  for (const entry of report.regressionCases) lines.push("| " + entry.provider + " | " + entry.supplierCode + " | #" + entry.expectedCandidate + " | " + (entry.finalRank ?? "—") + " | " + entry.finalStatus + " | " + (entry.passed ? "PASS" : "FAIL") + " |");
  return lines.join("\n") + "\n";
}

main().catch((error) => {
  console.error("[FINAL_PIPELINE_BENCHMARK_ERROR]");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
