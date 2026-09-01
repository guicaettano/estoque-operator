import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

const regressionCases = [
  {
    name: "MOTOR PARTIDA TIT 150 04/14 MAGN",
    item: {
      supplierCode: null,
      supplierReference: null,
      description: "MOTOR PARTIDA TIT 150 04/14 MAGN",
      quantity: 1,
      unitCost: 1,
      total: 1,
    } as PurchaseDocumentItem,
    provider: "tagplus" as const,
    expectedExternalId: "6491", // MAGNETRON
    expectedInTop3: ["6491", "1198"], // MAGNETRON e IRON
  },
  {
    name: "CHAVE LUZ TIT 2000 ES OSI (CCI)",
    item: {
      supplierCode: null,
      supplierReference: null,
      description: "CHAVE LUZ TIT 2000 ES OSI",
      quantity: 1,
      unitCost: 1,
      total: 1,
    } as PurchaseDocumentItem,
    provider: "cci" as const,
    expectedExternalId: "1702", // CCI: CHAVE LUZ TITAN 00/03 ES/KSE - OSI
    expectedInTop3: ["1702"],
  },
  {
    name: "CHAVE LUZ TIT 2000 ES OSI (TagPlus)",
    item: {
      supplierCode: null,
      supplierReference: null,
      description: "CHAVE LUZ TIT 2000 ES OSI",
      quantity: 1,
      unitCost: 1,
      total: 1,
    } as PurchaseDocumentItem,
    provider: "tagplus" as const,
    expectedExternalId: "5354", // TagPlus: CHAVE LUZ TITAN 00/04 ES/KSE/KS - IRON
    expectedInTop3: ["5354"],
  },
  {
    name: "BORRACHA REPARO FREIO (PINCA) TIT 00/150 OSI",
    item: {
      supplierCode: null,
      supplierReference: null,
      description: "BORRACHA REPARO FREIO (PINCA) TIT 00/150 OSI",
      quantity: 1,
      unitCost: 1,
      total: 1,
    } as PurchaseDocumentItem,
    provider: "tagplus" as const,
    expectedExternalId: "5913", // REPARO MOTO FREIO DISCO TITAN
    expectedInTop3: ["5913"],
  },
];

async function main() {
  console.log("=".repeat(80));
  console.log("VERIFICAÇÃO DE REGRESSÕES - GUARDRAIL OPENAI");
  console.log("=".repeat(80));
  console.log("");

  let passedCount = 0;
  let failedCount = 0;

  for (const testCase of regressionCases) {
    console.log("─".repeat(80));
    console.log(`CASO: ${testCase.name}`);
    console.log(`Provider: ${testCase.provider.toUpperCase()}`);
    console.log(`Expected: #${testCase.expectedExternalId}`);
    console.log("─".repeat(80));
    console.log("");

    try {
      // Precisamos de storeId
      const storeId = testCase.provider === "cci"
        ? process.env.CCI_STORE_ID
        : process.env.MATCH_INDEX_STORE_ID;

      if (!storeId) {
        console.error(`❌ Store ID para ${testCase.provider.toUpperCase()} não configurado`);
        console.error(`   CCI_STORE_ID=${process.env.CCI_STORE_ID || "undefined"}`);
        console.error(`   MATCH_INDEX_STORE_ID=${process.env.MATCH_INDEX_STORE_ID || "undefined"}`);
        failedCount++;
        continue;
      }

      console.log(`⏳ Executando matching...`);
      
      const result = await matchPurchaseDocumentItem({
        storeId,
        provider: testCase.provider,
        item: testCase.item,
      });

      // Raw ranks (do diagnostics)
      console.log("📊 RAW RETRIEVAL:");
      const rawCandidates = result.diagnostics?.candidates
        .filter((c) => !c.removedAt || c.removedAt === "compatibility_gate" || c.removedAt === "reranker" || c.removedAt === "final_limit")
        .sort((a, b) => (b.rawRetrievalScore ?? 0) - (a.rawRetrievalScore ?? 0))
        .slice(0, 5) || [];

      rawCandidates.forEach((candidate, index) => {
        const mark = testCase.expectedInTop3.includes(candidate.externalId) ? "✓" : " ";
        console.log(`  ${mark} #${index + 1} [${candidate.externalId}] ${candidate.description.substring(0, 60)}...`);
        console.log(`      Raw score: ${candidate.rawRetrievalScore?.toFixed(3) ?? "N/A"}`);
      });
      console.log("");

      // Structured ranks
      console.log("🔧 STRUCTURED RANKING:");
      const structuredCandidates = result.diagnostics?.candidates
        .filter((c) => !c.removed || c.removedAt === "reranker" || c.removedAt === "final_limit")
        .sort((a, b) => (b.structuredScore ?? 0) - (a.structuredScore ?? 0))
        .slice(0, 5) || [];

      structuredCandidates.forEach((candidate, index) => {
        const mark = testCase.expectedInTop3.includes(candidate.externalId) ? "✓" : " ";
        console.log(`  ${mark} #${index + 1} [${candidate.externalId}] ${candidate.description.substring(0, 60)}...`);
        console.log(`      Structured score: ${candidate.structuredScore?.toFixed(3) ?? "N/A"}`);
        console.log(`      Compatibility: ${candidate.compatibility ?? "N/A"}`);
      });
      console.log("");

      // OpenAI ranks
      if (result.aiCalled && result.diagnostics?.candidates.some((c) => c.aiRerankerScore !== null)) {
        console.log("🤖 OPENAI RERANKER:");
        const aiCandidates = result.diagnostics?.candidates
          .filter((c) => c.aiRerankerScore !== null)
          .sort((a, b) => (b.aiRerankerScore ?? 0) - (a.aiRerankerScore ?? 0))
          .slice(0, 5) || [];

        aiCandidates.forEach((candidate, index) => {
          const mark = testCase.expectedInTop3.includes(candidate.externalId) ? "✓" : " ";
          console.log(`  ${mark} #${index + 1} [${candidate.externalId}] ${candidate.description.substring(0, 60)}...`);
          console.log(`      AI score: ${candidate.aiRerankerScore?.toFixed(3) ?? "N/A"}`);
          console.log(`      AI reason: ${candidate.aiRerankerReason || "N/A"}`);
        });
        console.log("");
      } else {
        console.log("🤖 OPENAI RERANKER: Not called or no API key");
        console.log("");
      }

      // Final result
      console.log("✅ FINAL RESULT:");
      console.log(`   Store ID: ${storeId}`);
      console.log(`   Provider: ${testCase.provider}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Method: ${result.method}`);
      console.log(`   AI Called: ${result.aiCalled}`);
      console.log("");

      console.log("🏆 FINAL TOP 3:");
      result.candidates.slice(0, 3).forEach((candidate, index) => {
        const mark = testCase.expectedInTop3.includes(candidate.externalId) ? "✓" : " ";
        const isExpected = candidate.externalId === testCase.expectedExternalId ? " ⭐" : "";
        console.log(`  ${mark} #${index + 1} [${candidate.externalId}]${isExpected} ${candidate.description.substring(0, 60)}...`);
        console.log(`      Final score: ${candidate.finalScore?.toFixed(3) ?? candidate.deterministicScore?.toFixed(3) ?? "N/A"}`);
      });

      if (result.candidates.length === 0) {
        console.log("   ⚠️  NO CANDIDATES");
      }

      console.log("");

      // Verification
      console.log("🔍 VERIFICATION:");
      console.log(`   Provider: ${testCase.provider}`);
      console.log(`   Store ID: ${storeId}`);
      console.log(`   Expected: #${testCase.expectedExternalId}`);
      console.log(`   Retrieved Top 3: ${result.candidates.slice(0, 3).map((c) => "#" + c.externalId).join(", ") || "NONE"}`);
      
      const foundExpected = testCase.expectedExternalId
        ? result.candidates.slice(0, 3).some((c) => c.externalId === testCase.expectedExternalId)
        : testCase.expectedInTop3.some((expected) =>
          result.candidates.slice(0, 3).some((c) => c.externalId === expected)
        );

      if (foundExpected) {
        console.log(`   ✅ PASS: Expected candidate #${testCase.expectedExternalId} found in Top 3`);
        passedCount++;
      } else {
        console.log(`   ❌ FAIL: Expected candidate #${testCase.expectedExternalId} NOT in Top 3`);
        failedCount++;
      }

      console.log("");
    } catch (error) {
      console.error("❌ ERROR:", error instanceof Error ? error.message : error);
      console.log("");
      failedCount++;
    }
  }

  console.log("=".repeat(80));
  console.log("VERIFICAÇÃO CONCLUÍDA");
  console.log(`PASSED: ${passedCount}/${regressionCases.length}`);
  console.log(`FAILED: ${failedCount}/${regressionCases.length}`);
  console.log("=".repeat(80));
  
  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Erro fatal:", error);
  process.exit(1);
});
