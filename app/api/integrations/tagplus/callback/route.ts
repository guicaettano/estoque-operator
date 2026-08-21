import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/tagplus/auth";
import { exchangeAuthorizationCode, calculateExpiresAt, isValidOAuthState, TAGPLUS_SCOPE } from "@/lib/tagplus/oauth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TagPlusIntegrationError } from "@/lib/tagplus/types";

const STATE_COOKIE = "tagplus_oauth_state";
type StatePayload = { state: string; userId: string };

function readState(value?: string): StatePayload | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as Record<string, unknown>;
    return typeof data.state === "string" && typeof data.userId === "string" ? { state: data.state, userId: data.userId } : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(STATE_COOKIE);
  try {
    const oauthError = request.nextUrl.searchParams.get("error");
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const stored = readState((await cookies()).get(STATE_COOKIE)?.value);
    const user = await requireAuthenticatedUser();
    if (oauthError || !code || !stored || !isValidOAuthState(stored.state, state) || stored.userId !== user.id) {
      throw new TagPlusIntegrationError("Invalid or rejected OAuth callback", 400);
    }
    const token = await exchangeAuthorizationCode(code);
    const { error } = await createSupabaseAdminClient().from("tagplus_connections").upsert({
      user_id: user.id, access_token: token.access_token, refresh_token: token.refresh_token,
      token_type: token.token_type, scopes: TAGPLUS_SCOPE, expires_at: calculateExpiresAt(token.expires_in),
    }, { onConflict: "user_id" });
    if (error) throw new TagPlusIntegrationError("Unable to store TagPlus connection", 500);
    return response;
  } catch (error) {
    const status = error instanceof TagPlusIntegrationError ? error.status : 500;
    return NextResponse.json({ error: "TagPlus authorization failed" }, { status, headers: response.headers });
  }
}
