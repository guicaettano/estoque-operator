import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTagPlusAuthorizationUrl, calculateExpiresAt, exchangeAuthorizationCode, isAccessTokenValid, isValidOAuthState, parseProductsResponse, refreshTagPlusToken } from "@/lib/tagplus/oauth";

describe("TagPlus OAuth helpers", () => {
  beforeEach(() => {
    process.env.TAGPLUS_CLIENT_ID = "client-id";
    process.env.TAGPLUS_CLIENT_SECRET = "client-secret";
    vi.restoreAllMocks();
  });

  it("builds an authorization-code URL with the product write scope", () => {
    const url = new URL(buildTagPlusAuthorizationUrl("state-value"));
    expect(url.origin + url.pathname).toBe("https://developers.tagplus.com.br/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({ response_type: "code", client_id: "client-id", scope: "write:produtos", state: "state-value" });
  });

  it("treats near-expiry tokens as invalid", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    expect(isAccessTokenValid(calculateExpiresAt(61, now), now)).toBe(true);
    expect(isAccessTokenValid(calculateExpiresAt(60, now), now)).toBe(false);
  });

  it("accepts only the OAuth state stored for the callback", () => {
    expect(isValidOAuthState("stored-state", "stored-state")).toBe(true);
    expect(isValidOAuthState("stored-state", "attacker-state")).toBe(false);
    expect(isValidOAuthState("stored-state", null)).toBe(false);
  });

  it("exchanges codes and refreshes tokens as form data", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", token_type: "bearer", expires_in: 86400 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await exchangeAuthorizationCode("one-time-code");
    await refreshTagPlusToken("old-refresh");
    expect(fetchMock.mock.calls[0][1]?.body.toString()).toContain("grant_type=authorization_code");
    expect(fetchMock.mock.calls[1][1]?.body.toString()).toContain("grant_type=refresh_token");
  });

  it("rejects API errors and invalid product payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "invalid" }), { status: 401 })));
    await expect(exchangeAuthorizationCode("bad-code")).rejects.toMatchObject({ status: 401 });
    expect(parseProductsResponse([{ id: 1, descricao: "Item" }])).toEqual([{ id: 1, descricao: "Item" }]);
    expect(() => parseProductsResponse({ data: [] })).toThrow("Unexpected TagPlus products response");
  });
});
