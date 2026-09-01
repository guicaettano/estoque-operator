import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { persistGoldLabel } from "@/scripts/osias-labeling";
import { generateDiagnosticEmbeddings, resolveDiagnosticStore, retrieveRawTop30, type DiagnosticProvider } from "@/scripts/retrieval-diagnostics";
import { osiasMatchingGold } from "@/tests/fixtures/osias-matching-gold";

const fixturePath = path.join(process.cwd(), "tests", "fixtures", "osias-matching-gold.ts");

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const readline = createInterface({ input, output });
  try {
    const provider = await selectProvider(readline);
    const pending = osiasMatchingGold.filter((item) => (provider === "cci" ? item.cciVerification : item.tagPlusVerification) === "UNVERIFIED");
    let confirmedCount = countConfirmed();
    let preliminaryNoticeShown = confirmedCount >= 10;

    console.log(`\nRotulagem humana OSIAS — ${provider.toUpperCase()}`);
    console.log(`${pending.length} item(ns) UNVERIFIED. Nenhum candidato será escolhido automaticamente.\n`);
    if (preliminaryNoticeShown) console.log("Gold dataset suficiente para benchmark preliminar.");
    const storeId = await resolveDiagnosticStore(provider);

    for (const [index, item] of pending.entries()) {
      console.log(`\n[${index + 1}/${pending.length}] supplierCode: ${item.supplierCode}`);
      console.log(`description: ${item.description}`);
      console.log(`provider: ${provider}`);

      const [embedding] = await generateDiagnosticEmbeddings([item.description]);
      const candidates = await retrieveRawTop30({ provider, storeId, query: item.description, embedding, limit: 30 });
      console.table(candidates.map((candidate, candidateIndex) => ({
        rank: candidateIndex + 1,
        externalId: candidate.externalId,
        description: candidate.description,
        reference: candidate.reference,
        barcode: candidate.barcode,
        supplier: candidate.supplier,
      })));

      const action = await askForAction(readline, candidates.length);
      if (action.type === "quit") {
        console.log("Progresso salvo. Execute novamente para continuar pelos itens ainda UNVERIFIED.");
        return;
      }
      if (action.type === "skip") {
        await persistGoldLabel(fixturePath, { supplierCode: item.supplierCode, provider, status: "UNVERIFIED", externalId: null });
        console.log("Mantido como UNVERIFIED.");
        continue;
      }
      if (action.type === "not-in-catalog") {
        await persistGoldLabel(fixturePath, { supplierCode: item.supplierCode, provider, status: "NOT_IN_CATALOG", externalId: null });
        console.log("Marcado como NOT_IN_CATALOG.");
        continue;
      }

      const candidate = candidates[action.rank - 1];
      await persistGoldLabel(fixturePath, { supplierCode: item.supplierCode, provider, status: "CONFIRMED", externalId: candidate.externalId });
      confirmedCount += 1;
      console.log(`Confirmado manualmente: #${candidate.externalId} — ${candidate.description}`);
      if (!preliminaryNoticeShown && confirmedCount >= 10) {
        console.log("Gold dataset suficiente para benchmark preliminar.");
        preliminaryNoticeShown = true;
      }
    }

    console.log("Não há mais itens UNVERIFIED para este provider.");
    if (confirmedCount >= 10 && !preliminaryNoticeShown) console.log("Gold dataset suficiente para benchmark preliminar.");
  } finally {
    readline.close();
  }
}

async function selectProvider(readline: ReturnType<typeof createInterface>): Promise<DiagnosticProvider> {
  const fromArgument = readArgument("--provider");
  const selected = (fromArgument ?? await readline.question("Provider [cci/tagplus]: ")).trim().toLowerCase();
  if (selected !== "cci" && selected !== "tagplus") throw new Error('Use --provider cci ou --provider tagplus.');
  return selected;
}

async function askForAction(readline: ReturnType<typeof createInterface>, candidateCount: number): Promise<
  | { type: "confirm"; rank: number }
  | { type: "not-in-catalog" }
  | { type: "skip" }
  | { type: "quit" }
> {
  while (true) {
    const answer = (await readline.question("[1-30] confirmar candidato | [n] não existe | [s] pular | [q] sair: ")).trim().toLowerCase();
    if (answer === "n") return { type: "not-in-catalog" };
    if (answer === "s") return { type: "skip" };
    if (answer === "q") return { type: "quit" };
    const rank = Number(answer);
    if (Number.isInteger(rank) && rank >= 1 && rank <= candidateCount) return { type: "confirm", rank };
    console.log(`Resposta inválida. Escolha um rank entre 1 e ${candidateCount}, n, s ou q.`);
  }
}

function countConfirmed(): number {
  return osiasMatchingGold.reduce((total, item) => total + Number(item.cciVerification === "CONFIRMED") + Number(item.tagPlusVerification === "CONFIRMED"), 0);
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function printUsage() {
  console.log("Uso: npm run matching:label-osias -- --provider cci");
  console.log("     npm run matching:label-osias -- --provider tagplus");
  console.log("Sem --provider, o comando pergunta qual catálogo rotular.");
}

main().catch((error) => {
  console.error("Falha na rotulagem OSIAS.");
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
    console.error("cause:", error.cause);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
