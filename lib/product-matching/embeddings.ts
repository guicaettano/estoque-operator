import { MATCHING_CONFIG } from "@/lib/product-matching/config";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";

type EmbeddingResponse = { data?: Array<{ index: number; embedding: number[] }>; error?: { message?: string } };
const queryCache = new Map<string, Promise<number[] | null>>();

export async function generateEmbeddings(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("[EMBEDDING_API_ERROR] OPENAI_API_KEY não configurada para embeddings.");
  const normalized = inputs.map(normalizeProductDescription);
  if (normalized.some((input) => !input)) throw new Error("[EMBEDDING_API_ERROR] Texto vazio não pode gerar embedding.");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      signal: AbortSignal.timeout(MATCHING_CONFIG.embeddingTimeoutMs),
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_EMBEDDING_MODEL || MATCHING_CONFIG.embeddingModel,
        dimensions: MATCHING_CONFIG.embeddingDimensions,
        encoding_format: "float",
        input: normalized,
      }),
    });
  } catch (error) {
    throw new Error("[EMBEDDING_API_ERROR] Não foi possível chamar OpenAI embeddings.", { cause: error });
  }

  const body = redactApiKey(await response.text(), apiKey);
  if (!response.ok) {
    throw new Error(`[EMBEDDING_API_ERROR] OpenAI embeddings falhou: HTTP ${response.status} ${response.statusText}\n${body}`);
  }

  let payload: EmbeddingResponse;
  try {
    payload = JSON.parse(body) as EmbeddingResponse;
  } catch (error) {
    throw new Error("[EMBEDDING_API_ERROR] OpenAI embeddings retornou JSON inválido.", { cause: error });
  }
  if (!payload.data) throw new Error(`[EMBEDDING_API_ERROR] OpenAI embeddings não retornou vetores.\n${body}`);

  const vectors = [...payload.data].sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
  if (vectors.length !== inputs.length || vectors.some((vector) => vector.length !== MATCHING_CONFIG.embeddingDimensions)) {
    throw new Error(`[VECTOR_DIMENSION_ERROR] Dimensão de embedding inesperada. Esperado: ${MATCHING_CONFIG.embeddingDimensions}; recebido: ${vectors.map((vector) => vector.length).join(", ")}.`);
  }
  return vectors;
}

export function tryGenerateQueryEmbedding(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return Promise.resolve(null);
  const key = normalizeProductDescription(text);
  const cached = queryCache.get(key);
  if (cached) return cached;
  const promise = generateEmbeddings([key]).then(([embedding]) => embedding).catch((error) => {
    if (process.env.NODE_ENV === "development") {
      console.warn("product-matching: embedding fallback");
      if (error instanceof Error) {
        console.warn(error.message);
        console.warn(error.stack);
        console.warn("cause:", error.cause);
      } else {
        console.warn(error);
      }
    }
    return null;
  });
  queryCache.set(key, promise);
  return promise;
}

function redactApiKey(value: string, apiKey: string): string {
  return value.replaceAll(apiKey, "[REDACTED]");
}
