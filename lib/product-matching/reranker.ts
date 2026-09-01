import { MATCHING_CONFIG } from "@/lib/product-matching/config";
import type { MatchStatus, ProductCandidateReranker, RerankResult } from "@/lib/product-matching/types";

type OpenAIResponse = { output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
const statuses = new Set<MatchStatus>(["MATCH_PROBABLE", "REVIEW_REQUIRED", "NO_CONFIDENT_MATCH"]);
export const RERANKER_INSTRUCTIONS = `Você ranqueia candidatos para decidir se representam A MESMA PEÇA do item recebido. Todos já passaram por um compatibility gate; não invente nem reintroduza produtos ausentes. Leia supplierCode e supplierReference como códigos estruturados do fabricante, nunca como externalId do ERP. Um exactReferenceMatch é evidência fortíssima e nearReferenceMatch é evidência relevante; ambos devem ser considerados antes da similaridade textual. Mesmo assim, nunca aceite cegamente um código quando houver conflito explícito de tipo de peça, veículo ou aplicação. Expanda abreviações pelo contexto automotivo, como PART = PARTIDA, TIT = TITAN, ESCAP = ESCAPAMENTO e PINCA = PINÇA. Identidade da peça domina veículo, ano e similaridade temática. Modelo, cilindrada, período, variante e marca refinam a decisão. Ausência de um atributo é UNKNOWN, não conflito. Contradição explícita reduz confiança. Ordene em ranking todos os candidatos do mais provável ao menos provável, usando somente externalId fornecido. bestExternalId deve ser o primeiro do ranking quando houver evidência suficiente. Quando nenhum representar a mesma peça, bestExternalId deve ser null e status NO_CONFIDENT_MATCH, mas ainda avalie os candidatos no ranking para diagnóstico.`;
const rankingItem = { type: "object", additionalProperties: false, required: ["externalId", "confidence", "reason"], properties: { externalId: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, reason: { type: "string" } } } as const;
const schema = { type: "object", additionalProperties: false, required: ["bestExternalId", "confidence", "status", "reason", "ranking"], properties: { bestExternalId: { type: ["string", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, status: { type: "string", enum: ["MATCH_PROBABLE", "REVIEW_REQUIRED", "NO_CONFIDENT_MATCH"] }, reason: { type: "string" }, ranking: { type: "array", items: rankingItem, maxItems: 10 } } } as const;

function outputText(payload: OpenAIResponse) { for (const output of payload.output ?? []) for (const content of output.content ?? []) if (content.type === "output_text" && typeof content.text === "string") return content.text; return null; }

export function validateRerankResult(value: unknown, allowedExternalIds: Set<string>): RerankResult {
  if (!value || typeof value !== "object") throw new Error("Resposta de reranking inválida.");
  const raw = value as Record<string, unknown>;
  const entries = Array.isArray(raw.ranking) ? raw.ranking as Array<Record<string, unknown>> : [];
  const seen = new Set<string>();
  const ranking = entries.map((entry) => {
    if (typeof entry.externalId !== "string" || !allowedExternalIds.has(entry.externalId)) throw new Error("O reranker retornou um externalId fora dos candidatos.");
    if (seen.has(entry.externalId)) throw new Error("O reranker repetiu um externalId.");
    if (typeof entry.confidence !== "number" || entry.confidence < 0 || entry.confidence > 1 || typeof entry.reason !== "string") throw new Error("Resposta de reranking inválida.");
    seen.add(entry.externalId);
    return { externalId: entry.externalId, confidence: entry.confidence, reason: entry.reason };
  });
  const legacy = !("bestExternalId" in raw);
  const bestExternalId = legacy ? ranking[0]?.externalId ?? null : raw.bestExternalId;
  const confidence = raw.confidence;
  const status = raw.status as MatchStatus;
  const reason = raw.reason;
  if (!(bestExternalId === null || typeof bestExternalId === "string") || typeof confidence !== "number" || confidence < 0 || confidence > 1 || !statuses.has(status) || typeof reason !== "string") throw new Error("Resposta de reranking inválida.");
  if (typeof bestExternalId === "string" && !allowedExternalIds.has(bestExternalId)) throw new Error("O reranker retornou um externalId fora dos candidatos.");
  if (status === "NO_CONFIDENT_MATCH" && bestExternalId !== null) throw new Error("NO_CONFIDENT_MATCH exige bestExternalId null.");
  if (bestExternalId && ranking[0]?.externalId !== bestExternalId) throw new Error("bestExternalId deve ser o primeiro do ranking.");
  return { bestExternalId, confidence, status, reason, ranking: ranking.length ? ranking : bestExternalId ? [{ externalId: bestExternalId, confidence, reason }] : [] };
}

export class OpenAIProductCandidateReranker implements ProductCandidateReranker {
  async rerank({ item, parsedIntent, candidates }: Parameters<ProductCandidateReranker["rerank"]>[0]): Promise<RerankResult> {
    const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) throw new Error("Reranker de IA não configurado.");
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", signal: AbortSignal.timeout(MATCHING_CONFIG.aiTimeoutMs), cache: "no-store", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_MATCHING_MODEL || process.env.OPENAI_DOCUMENT_MODEL || "gpt-5.4", store: false, instructions: RERANKER_INSTRUCTIONS, input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ item, parsedIntent, candidates: candidates.map(({ externalId, description, reference, barcode, supplier, parsedIntent: candidateIntent, compatibility, deterministicScore, scoreBreakdown }) => ({ externalId, description, reference, barcode, supplier, parsedIntent: candidateIntent, compatibility, referenceMatch: { normalizedSupplierCode: scoreBreakdown.normalizedSupplierCode, exactReferenceMatch: scoreBreakdown.exactReferenceMatch, nearReferenceMatch: scoreBreakdown.nearReferenceMatch, source: scoreBreakdown.referenceMatchSource }, structuredConfidence: deterministicScore })) }) }] }], text: { format: { type: "json_schema", name: "product_candidate_ranking", strict: true, schema } }, max_output_tokens: 2400 }) });
    const payload = await response.json().catch(() => null) as OpenAIResponse | null;
    if (!response.ok || !payload) throw new Error(payload?.error?.message || "Falha no reranker de IA.");
    const text = outputText(payload); if (!text) throw new Error("Reranker de IA retornou resposta vazia.");
    return validateRerankResult(JSON.parse(text) as unknown, new Set(candidates.map((candidate) => candidate.externalId)));
  }
}
