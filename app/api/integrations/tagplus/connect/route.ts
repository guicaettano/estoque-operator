import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/tagplus/auth";
import { buildTagPlusAuthorizationUrl, createOAuthState } from "@/lib/tagplus/oauth";
import { TagPlusIntegrationError } from "@/lib/tagplus/types";

export const runtime = "nodejs";
const STATE_COOKIE = "tagplus_oauth_state";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const state = createOAuthState();
    const response = NextResponse.redirect(buildTagPlusAuthorizationUrl(state));
    response.cookies.set(STATE_COOKIE, JSON.stringify({ state, userId: user.id }), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/tagplus/callback", maxAge: 600,
    });
    return response;
  } catch (error) {
    const status = error instanceof TagPlusIntegrationError ? error.status : 500;
    return NextResponse.json({ error: "Unable to start TagPlus authorization" }, { status });
  }
}
