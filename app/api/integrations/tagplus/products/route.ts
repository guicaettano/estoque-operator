import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/tagplus/auth";
import { TAGPLUS_API_BASE_URL, parseProductsResponse } from "@/lib/tagplus/oauth";
import { getValidTagPlusAccessToken } from "@/lib/tagplus/service";
import { TagPlusIntegrationError, type TagPlusApiError } from "@/lib/tagplus/types";

export const runtime = "nodejs";

async function fetchProducts(accessToken: string) {
  const response = await fetch(`${TAGPLUS_API_BASE_URL}/produtos`, {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Api-Version": "2.0", Accept: "application/json" }, cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => undefined);
  return { response, payload };
}

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    let token = await getValidTagPlusAccessToken(user.id);
    let { response, payload } = await fetchProducts(token);
    if (response.status === 401) {
      token = await getValidTagPlusAccessToken(user.id, true);
      ({ response, payload } = await fetchProducts(token));
    }
    if (!response.ok) throw new TagPlusIntegrationError("TagPlus products request failed", response.status, payload as TagPlusApiError | undefined);
    return NextResponse.json(parseProductsResponse(payload));
  } catch (error) {
    const status = error instanceof TagPlusIntegrationError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to fetch TagPlus products" }, { status });
  }
}
