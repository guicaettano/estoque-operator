import type { ExternalProduct } from "./types";

export type CciSyncSummary = {
  success: true;
  received: number;
  upserted: number;
  errors: number;
};

export function chunkProducts<T>(products: readonly T[], batchSize: number): T[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error("batchSize deve ser um inteiro positivo.");
  const chunks: T[][] = [];
  for (let index = 0; index < products.length; index += batchSize) {
    chunks.push(products.slice(index, index + batchSize));
  }
  return chunks;
}

export async function syncProductBatches(input: {
  products: ExternalProduct[];
  storeId: string;
  syncUrl: string;
  connectorToken: string;
  batchSize: number;
  requestTimeoutMs: number;
  fetcher?: typeof fetch;
}): Promise<CciSyncSummary> {
  const fetcher = input.fetcher ?? fetch;
  const batches = input.products.length > 0 ? chunkProducts(input.products, input.batchSize) : [[]];
  let received = 0;
  let upserted = 0;
  let errors = 0;

  for (const products of batches) {
    const response = await fetcher(input.syncUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.connectorToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ storeId: input.storeId, products }),
      signal: AbortSignal.timeout(input.requestTimeoutMs),
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isSyncSummary(payload)) throw new Error(readApiError(payload, response.status));

    received += payload.received;
    upserted += payload.upserted;
    errors += payload.errors;
  }

  return { success: true, received, upserted, errors };
}

function isSyncSummary(value: unknown): value is CciSyncSummary {
  if (typeof value !== "object" || value === null) return false;
  const summary = value as Record<string, unknown>;
  return summary.success === true
    && Number.isInteger(summary.received)
    && Number.isInteger(summary.upserted)
    && Number.isInteger(summary.errors);
}

function readApiError(value: unknown, status: number): string {
  if (typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).error === "string") {
    return `API de sync (${status}): ${(value as Record<string, unknown>).error}`;
  }
  return `API de sync retornou HTTP ${status}.`;
}
