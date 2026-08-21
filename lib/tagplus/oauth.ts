import { TagPlusIntegrationError, type TagPlusOAuthTokenResponse, type TagPlusProductsResponse } from "@/lib/tagplus/types";

export const TAGPLUS_API_BASE_URL = "https://api.tagplus.com.br";
export const TAGPLUS_SCOPE = "read:produtos";
const TOKEN_EXPIRY_SKEW_MS = 60_000;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createOAuthState(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function isValidOAuthState(expected: string, received: string | null): boolean {
  return received !== null && expected.length === received.length && expected === received;
}

export function buildTagPlusAuthorizationUrl(state: string): string {
  const url = new URL("/authorize", TAGPLUS_API_BASE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env("TAGPLUS_CLIENT_ID"));
  url.searchParams.set("scope", TAGPLUS_SCOPE);
  url.searchParams.set("state", state);
  // TagPlus documents redirect_uri as unsupported; it uses the registered callback URL.
  return url.toString();
}

function isOAuthTokenResponse(value: unknown): value is TagPlusOAuthTokenResponse {
  if (!value || typeof value !== "object") return false;
  const token = value as Record<string, unknown>;
  return typeof token.access_token === "string" && typeof token.refresh_token === "string" &&
    typeof token.token_type === "string" && typeof token.expires_in === "number";
}

async function requestToken(fields: Record<string, string>): Promise<TagPlusOAuthTokenResponse> {
  const body = new URLSearchParams({ ...fields, client_id: env("TAGPLUS_CLIENT_ID"), client_secret: env("TAGPLUS_CLIENT_SECRET") });
  const response = await fetch(`${TAGPLUS_API_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isOAuthTokenResponse(payload)) {
    throw new TagPlusIntegrationError("TagPlus token request failed", response.status, payload as import("@/lib/tagplus/types").TagPlusApiError | undefined);
  }
  return payload;
}

export function exchangeAuthorizationCode(code: string) {
  return requestToken({ grant_type: "authorization_code", code });
}

export function refreshTagPlusToken(refreshToken: string) {
  return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export function calculateExpiresAt(expiresInSeconds: number, now = new Date()): string {
  return new Date(now.getTime() + expiresInSeconds * 1_000).toISOString();
}

export function isAccessTokenValid(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() > now.getTime() + TOKEN_EXPIRY_SKEW_MS;
}

export function parseProductsResponse(value: unknown): TagPlusProductsResponse {
  if (!Array.isArray(value) || !value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
    throw new TagPlusIntegrationError("Unexpected TagPlus products response", 502);
  }
  return value as TagPlusProductsResponse;
}
