import { createHash } from "node:crypto";

export function readBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export function hashConnectorToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
