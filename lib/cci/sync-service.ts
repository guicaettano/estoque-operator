import { hashConnectorToken } from "@/lib/cci/auth";
import type { CciSyncPayload, CciSyncSummary, ExternalProduct } from "@/lib/cci/types";

export type CciCredential = {
  id: string;
  storeId: string;
};

export interface CciSyncRepository {
  findActiveCredential(tokenHash: string): Promise<CciCredential | null>;
  upsertProducts(storeId: string, products: ExternalProduct[]): Promise<number>;
  markCredentialUsed(credentialId: string): Promise<void>;
}

export class CciSyncError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CciSyncError";
  }
}

export async function syncCciProducts(
  token: string,
  payload: CciSyncPayload,
  repository: CciSyncRepository,
): Promise<CciSyncSummary> {
  const credential = await repository.findActiveCredential(hashConnectorToken(token));
  if (!credential) throw new CciSyncError("Credencial do connector inválida.", 401);
  if (credential.storeId !== payload.storeId) {
    throw new CciSyncError("A credencial não tem acesso à loja informada.", 403);
  }

  const upserted = await repository.upsertProducts(payload.storeId, payload.products);
  await repository.markCredentialUsed(credential.id);

  return {
    success: true,
    received: payload.products.length,
    upserted,
    errors: 0,
  };
}
