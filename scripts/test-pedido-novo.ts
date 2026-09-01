import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

// 8 itens do pedido de teste
const testItems: Array<{ code: string; description: string; qty: number; price: number }> = [
  { code: "55022", description: "ANEL ESCAPE DAFRA RIVA 150 VEDAM", qty: 5, price: 4.25 },
  { code: "24112", description: "BORRACHA REPARO FREIO PINCA TIT 00/150 OSI", qty: 5, price: 6.63 },
  { code: "21892", description: "CABO VELOCIMETRO TIT 2000 ES OSI", qty: 2, price: 7.57 },
  { code: "52191", description: "CANELA BENGALA DIR TIT 150 04/08 ESD OSI", qty: 2, price: 68.87 },
  { code: "27316", description: "CHAVE LUZ TIT 2000 ES OSI", qty: 1, price: 28.41 },
  { code: "19944", description: "CORRENTE COMANDO SHINERAY XY-50Q 82L OSI", qty: 1, price: 9.89 },
  { code: "40259", description: "DISCO FREIO DIANT TIT 00/BROS 160 OSI", qty: 1, price: 54.90 },
  { code: "54079", description: "VARETA FREIO CG/TIT 99/00 OSI", qty: 5, price: 4.95 },
];

async function testPedido() {
  console.log("================================================================================");
  console.log("TESTE: PEDIDO DE TESTE - ESTOQUE OPERATOR");
  console.log("================================================================================");
  console.log("");
  console.log(`Total de itens: ${testItems.length}`);
  console.log(`Fornecedor: FORNECEDOR TESTE MOTO PECAS LTDA`);
  console.log(`Data: 29/08/2026`);
  console.log("");

  const cciStoreId = process.env.CCI_STORE_ID;
  const tagplusStoreId = process.env.MATCH_INDEX_STORE_ID;

  if (!cciStoreId || !tagplusStoreId) {
    console.error("❌ Erro: CCI_STORE_ID ou MATCH_INDEX_STORE_ID não configurados");
    process.exit(1);
  }

  let totalMatched = 0;
  let totalReview = 0;
  let totalNoMatch = 0;

  for (const testItem of testItems) {
    console.log("─".repeat(80));
    console.log(`[${testItem.code}] ${testItem.description}`);
    console.log(`Qtd: ${testItem.qty} | Preço: R$ ${testItem.price.toFixed(2)}`);
    console.log("─".repeat(80));

    const item: PurchaseDocumentItem = {
      supplierCode: testItem.code,
      supplierReference: null,
      description: testItem.description,
      quantity: testItem.qty,
      unitCost: testItem.price,
      total: testItem.qty * testItem.price,
    };

    try {
      // Testar primeiro com CCI
      console.log("\n🔍 CCI:");
      const cciResult = await matchPurchaseDocumentItem({
        storeId: cciStoreId,
        provider: "cci",
        item,
      });

      console.log(`   Status: ${cciResult.status}`);
      console.log(`   Method: ${cciResult.method}`);
      console.log(`   AI Called: ${cciResult.aiCalled ? "✅ Sim" : "❌ Não"}`);
      
      if (cciResult.candidates.length > 0) {
        console.log(`   Top 3:`);
        cciResult.candidates.slice(0, 3).forEach((candidate, index) => {
          console.log(`      ${index + 1}. [${candidate.externalId}] ${candidate.description.substring(0, 50)}...`);
          console.log(`         Score: ${candidate.finalScore?.toFixed(3) ?? candidate.deterministicScore?.toFixed(3) ?? "N/A"}`);
        });
      } else {
        console.log(`   ⚠️  Nenhum candidato encontrado`);
      }

      // Testar com TagPlus
      console.log("\n🔍 TAGPLUS:");
      const tagplusResult = await matchPurchaseDocumentItem({
        storeId: tagplusStoreId,
        provider: "tagplus",
        item,
      });

      console.log(`   Status: ${tagplusResult.status}`);
      console.log(`   Method: ${tagplusResult.method}`);
      console.log(`   AI Called: ${tagplusResult.aiCalled ? "✅ Sim" : "❌ Não"}`);
      
      if (tagplusResult.candidates.length > 0) {
        console.log(`   Top 3:`);
        tagplusResult.candidates.slice(0, 3).forEach((candidate, index) => {
          console.log(`      ${index + 1}. [${candidate.externalId}] ${candidate.description.substring(0, 50)}...`);
          console.log(`         Score: ${candidate.finalScore?.toFixed(3) ?? candidate.deterministicScore?.toFixed(3) ?? "N/A"}`);
        });
      } else {
        console.log(`   ⚠️  Nenhum candidato encontrado`);
      }

      // Contabilizar resultados
      const bestResult = cciResult.candidates.length > 0 ? cciResult : tagplusResult;
      if (bestResult.status === "MATCH_PROBABLE") {
        totalMatched++;
      } else if (bestResult.status === "REVIEW_REQUIRED") {
        totalReview++;
      } else {
        totalNoMatch++;
      }

      console.log("");
    } catch (error) {
      console.error(`❌ ERRO: ${error instanceof Error ? error.message : error}`);
      console.log("");
      totalNoMatch++;
    }
  }

  console.log("================================================================================");
  console.log("RESUMO DO TESTE");
  console.log("================================================================================");
  console.log(`Total de itens testados: ${testItems.length}`);
  console.log(`✅ Matched: ${totalMatched}`);
  console.log(`⚠️  Review Required: ${totalReview}`);
  console.log(`❌ No Match: ${totalNoMatch}`);
  console.log("");
  console.log("================================================================================");

  // Itens que testam aliases específicos
  console.log("\n🎯 VALIDAÇÃO DOS ALIASES:");
  console.log("─".repeat(80));
  console.log("✅ ANEL ESCAPE → testa alias ESCAP → ESCAPE");
  console.log("✅ BORRACHA REPARO FREIO PINCA → testa REPARO PINCA FREIO");
  console.log("✅ CABO VELOCIMETRO → testa abreviação VELOC");
  console.log("✅ CORRENTE COMANDO → alias já existente");
  console.log("");
  console.log("🎯 VALIDAÇÃO DO GUARDRAIL:");
  console.log("─".repeat(80));
  console.log("Se algum item mostrar status REVIEW_REQUIRED, o guardrail está funcionando!");
  console.log("");
}

testPedido().catch((error) => {
  console.error("Erro fatal:", error);
  process.exit(1);
});
