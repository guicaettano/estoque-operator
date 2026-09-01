import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pdf from "pdf-parse";
import { calculateBenchmarkMetrics, type MatchingGroundTruth } from "@/lib/product-matching/benchmark";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";
import { retrieveProductCandidates } from "@/lib/product-matching/retrieval";
import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { ProductMatchResult } from "@/lib/product-matching/types";
import { parseOsiasDocument } from "@/lib/purchase-documents/parsers/osias";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function report(label: string, results: ProductMatchResult[], groundTruth: MatchingGroundTruth) {
  const metrics = calculateBenchmarkMetrics(results, groundTruth);
  console.log(`${label}:`);
  console.log(`Top1: ${metrics.top1Correct}/${metrics.evaluated} = ${(metrics.top1Accuracy * 100).toFixed(1)}%`);
  console.log(`Top3: ${metrics.top3Correct}/${metrics.evaluated} = ${(metrics.top3Recall * 100).toFixed(1)}%`);
}

async function main() {
  const storeId = process.env.MATCH_BENCHMARK_STORE_ID ?? process.env.CCI_STORE_ID;
  if (!storeId || !UUID.test(storeId)) {
    throw new Error("MATCH_BENCHMARK_STORE_ID deve ser o UUID da loja CCI (o mesmo valor de CCI_STORE_ID). Não use um token cci_ do connector.");
  }
  const fixture = join(process.cwd(), "tests", "fixtures", "pedido-osias-13506.pdf");
  const truthPath = join(process.cwd(), "tests", "fixtures", "osias-matching-ground-truth.json");
  const groundTruth = JSON.parse(await readFile(truthPath, "utf8")) as MatchingGroundTruth;
  if (!Object.keys(groundTruth).length) throw new Error(`Preencha o gabarito em ${truthPath} no formato { "supplierCode": "correctExternalId" }.`);
  const items = parseOsiasDocument((await pdf(await readFile(fixture))).text);

  const deterministic: ProductMatchResult[] = [];
  for (const item of items) {
    const candidates = await retrieveProductCandidates({ storeId, provider: "cci", item });
    deterministic.push({ item, normalizedQuery: normalizeProductDescription(item.description), parsedIntent: parseProductIntent(item), status: candidates.length ? "REVIEW_REQUIRED" : "NO_CONFIDENT_MATCH", method: "deterministic", aiCalled: false, candidates: candidates.slice(0, 3) });
  }
  const hybrid: ProductMatchResult[] = [];
  for (const item of items) hybrid.push(await matchPurchaseDocumentItem({ storeId, provider: "cci", item }));
  report("Deterministic", deterministic, groundTruth);
  report("Hybrid", hybrid, groundTruth);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
