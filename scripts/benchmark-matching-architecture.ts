import { buildStructuredCandidatePool } from "@/lib/product-matching/structured-ranking";
import { buildProductMatchInput } from "@/lib/product-matching/input";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { osiasMatchingGold } from "@/tests/fixtures/osias-matching-gold";

type Provider = "cci" | "tagplus";
const FORBIDDEN: Record<string, RegExp> = {
  "24112": /FLEXIVEL FREIO/i,
  "52191": /PEDALEIRA/i,
  "40259": /INTERRUPTOR.*FREIO/i,
  "27316": /ANEL.*TAMPA.*PARTIDA/i,
  "6396": /TAMPA.*MOTOR.*PARTIDA/i,
  "55189": /BAGAGEIRO|CARCACA.*PAINEL|PROTE(?:CAO|TOR).*ESCAP|ESCAPAMENTO/i,
};
const FOCUS_CODES = new Set([...Object.keys(FORBIDDEN), "45135", "37516", "25610", "57314"]);

async function loadStores() {
  const { data, error } = await createSupabaseAdminClient().from("stores").select("id, provider").in("provider", ["cci", "tagplus"]);
  if (error) throw error;
  const result = Object.fromEntries((data ?? []).map((store) => [String(store.provider), String(store.id)]));
  if (!result.cci || !result.tagplus) throw new Error("Lojas CCI e TagPlus são necessárias.");
  return result as Record<Provider, string>;
}

async function benchmark(provider: Provider, storeId: string) {
  const rows = [];
  for (const gold of osiasMatchingGold) {
    const item = buildProductMatchInput({ supplierCode: gold.supplierCode, supplierReference: null, description: gold.description, quantity: 1, unitCost: 0, total: null });
    const pool = await buildStructuredCandidatePool({ storeId, provider, item });
    const top = pool.eligible.slice(0, 3);
    const finalStatus = !top.length
      ? "NO_CONFIDENT_MATCH"
      : top[0].compatibility?.partTypeCompatibility === "COMPATIBLE" && top[0].deterministicScore >= 0.72
        ? "MATCH_PROBABLE"
        : "REVIEW_REQUIRED";
    const expected = provider === "cci" ? gold.correctCciExternalId : gold.correctTagPlusExternalId;
    const verified = provider === "cci" ? gold.cciVerification === "CONFIRMED" : gold.tagPlusVerification === "CONFIRMED";
    rows.push({ code: gold.supplierCode, finalStatus, queryPartType: pool.intent.partType, retrieved: pool.retrieval.length, removed: pool.retrieval.length - pool.eligible.length, top1Compatibility: top[0]?.compatibility?.partTypeCompatibility ?? null, top: top.map((candidate) => ({ id: candidate.externalId, description: candidate.description, confidence: Number(candidate.deterministicScore.toFixed(3)), compatibility: candidate.compatibility?.partTypeCompatibility ?? null })), forbiddenTop1: Boolean(top[0] && FORBIDDEN[gold.supplierCode]?.test(top[0].description)), expected, verified, top1Correct: Boolean(verified && expected && top[0]?.externalId === expected), top3Correct: Boolean(verified && expected && top.some((candidate) => candidate.externalId === expected)) });
  }
  const verified = rows.filter((row) => row.verified);
  return {
    summary: { provider, total: rows.length, queryPartTypeRecognized: rows.filter((row) => row.queryPartType).length, candidatesRemovedByGate: rows.reduce((sum, row) => sum + row.removed, 0), noConfidentMatch: rows.filter((row) => row.finalStatus === "NO_CONFIDENT_MATCH").length, reviewRequired: rows.filter((row) => row.finalStatus === "REVIEW_REQUIRED").length, matchProbable: rows.filter((row) => row.finalStatus === "MATCH_PROBABLE").length, top1Compatible: rows.filter((row) => row.top1Compatibility === "COMPATIBLE").length, top1Unknown: rows.filter((row) => row.top1Compatibility === "UNKNOWN").length, graveFalsePositiveAutoMatch: rows.filter((row) => row.forbiddenTop1 && row.finalStatus === "MATCH_PROBABLE").length, verified: verified.length, verifiedTop1: verified.filter((row) => row.top1Correct).length, verifiedTop3: verified.filter((row) => row.top3Correct).length },
    focusCases: rows.filter((row) => FOCUS_CODES.has(row.code)),
  };
}

async function main() {
  const stores = await loadStores();
  const results = [];
  for (const provider of ["cci", "tagplus"] as const) results.push(await benchmark(provider, stores[provider]));
  console.log(JSON.stringify({
    before: {
      gate: "boolean_strict",
      userReportedCciNoMatchCases: ["CAMARA AR TRAS BIZ", "ESCAPE M.ORIG YBR 00/08 TORK", "MANICOTO EMBR FAZER/LANDER", "TUBO INTERNO BENGALA TIT 150/160"],
      lastMeasured: {
        cci: { noEligibleCandidate: 2, verifiedTop1: "2/2", graveFalsePositiveTop1: 0 },
        tagplus: { noEligibleCandidate: 2, verifiedItems: 0, graveFalsePositiveTop1: 0 },
      },
    },
    after: results,
  }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
