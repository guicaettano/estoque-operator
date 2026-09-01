import { matchPurchaseDocumentItem } from "@/lib/product-matching/service";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

// 3 itens chave para teste rápido
const testItems = [
  { code: "55022", description: "ANEL ESCAPE DAFRA RIVA 150 VEDAM", name: "ANEL ESCAPE (alias ESCAP)" },
  { code: "24112", description: "BORRACHA REPARO FREIO PINCA TIT 00/150 OSI", name: "REPARO FREIO PINCA" },
  { code: "27316", description: "CHAVE LUZ TIT 2000 ES OSI", name: "CHAVE LUZ (regressão conhecida)" },
];

async function testRapido() {
  console.log("=== TESTE RÁPIDO: PEDIDO NOVO ===\n");

  const storeId = process.env.MATCH_INDEX_STORE_ID || process.env.CCI_STORE_ID;
  const provider = process.env.MATCH_INDEX_STORE_ID ? "tagplus" : "cci";

  if (!storeId) {
    console.error("Erro: STORE_ID não configurado");
    return;
  }

  for (const test of testItems) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`[${test.code}] ${test.name}`);
    console.log(`Query: "${test.description}"`);
    console.log(`${"─".repeat(70)}`);

    const item: PurchaseDocumentItem = {
      supplierCode: test.code,
      supplierReference: null,
      description: test.description,
      quantity: 1,
      unitCost: 1,
      total: 1,
    };

    try {
      const result = await matchPurchaseDocumentItem({ storeId, provider: provider as "cci" | "tagplus", item });

      console.log(`Status: ${result.status}`);
      console.log(`AI Called: ${result.aiCalled ? "Sim" : "Não"}`);
      console.log(`Candidatos: ${result.candidates.length}`);

      if (result.candidates.length > 0) {
        console.log(`\nTop 3:`);
        result.candidates.slice(0, 3).forEach((c, i) => {
          const score = c.finalScore ?? c.deterministicScore ?? 0;
          console.log(`  ${i + 1}. [${c.externalId}] ${c.description.substring(0, 45)}... (${score.toFixed(3)})`);
        });
      } else {
        console.log("\n⚠️ Nenhum candidato encontrado");
      }
    } catch (error) {
      console.error(`Erro: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("TESTE CONCLUÍDO");
  console.log(`${"=".repeat(70)}\n`);
}

testRapido().catch(console.error);
