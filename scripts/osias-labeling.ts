import { readFile, writeFile } from "node:fs/promises";
import type { GoldMatchStatus } from "@/tests/fixtures/osias-matching-gold";
import type { DiagnosticProvider } from "@/scripts/retrieval-diagnostics";

export type GoldLabelDecision = {
  supplierCode: string;
  provider: DiagnosticProvider;
  status: GoldMatchStatus;
  externalId: string | null;
};

export function applyGoldLabelToFixture(source: string, decision: GoldLabelDecision): string {
  if (decision.status === "CONFIRMED" && !decision.externalId) {
    throw new Error("CONFIRMED exige externalId.");
  }
  if (decision.status !== "CONFIRMED" && decision.externalId !== null) {
    throw new Error(`${decision.status} exige externalId null.`);
  }

  const fields = decision.provider === "cci"
    ? { externalId: "correctCciExternalId", status: "cciVerification" }
    : { externalId: "correctTagPlusExternalId", status: "tagPlusVerification" };
  const matcher = new RegExp(`^(\\s*\\{ supplierCode: "${escapeRegExp(decision.supplierCode)}",[^\\r\\n]*)(\\r?\\n?)`, "m");
  const found = source.match(matcher);
  if (!found) throw new Error(`Item ${decision.supplierCode} não foi encontrado no fixture.`);

  let line = replaceField(found[1], fields.externalId, decision.externalId === null ? "null" : JSON.stringify(decision.externalId));
  line = replaceField(line, fields.status, JSON.stringify(decision.status));
  if (decision.status === "UNVERIFIED" && !hasUnverifiedNote(line)) {
    line = addUnverifiedNote(line);
  }
  return source.replace(matcher, `${line}${found[2]}`);
}

export async function persistGoldLabel(filePath: string, decision: GoldLabelDecision): Promise<void> {
  const current = await readFile(filePath, "utf8");
  const updated = applyGoldLabelToFixture(current, decision);
  await writeFile(filePath, updated, "utf8");
}

function replaceField(line: string, field: string, value: string): string {
  const pattern = new RegExp(`(${escapeRegExp(field)}: )(?:null|"(?:[^"\\\\]|\\\\.)*")`);
  if (!pattern.test(line)) throw new Error(`Campo ${field} não foi encontrado no fixture.`);
  return line.replace(pattern, `$1${value}`);
}

function hasUnverifiedNote(line: string): boolean {
  const notes = line.match(/notes: "((?:[^"\\]|\\.)*)"/);
  return Boolean(notes?.[1].includes("UNVERIFIED"));
}

function addUnverifiedNote(line: string): string {
  const notes = /notes: "((?:[^"\\]|\\.)*)"/;
  if (notes.test(line)) {
    return line.replace(notes, (_match, current: string) => `notes: "UNVERIFIED. ${current}"`);
  }
  return line.replace(/ \},?$/, ', notes: "UNVERIFIED." }');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
