import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/tagplus/auth";
import { TAGPLUS_API_BASE_URL, parseProductsResponse } from "@/lib/tagplus/oauth";
import { buildTagPlusProductUpdatePayload, getUnappliedTagPlusProductFields, sanitizeTagPlusProductChanges } from "@/lib/tagplus/products";
import { getValidTagPlusAccessToken } from "@/lib/tagplus/service";
import { TagPlusIntegrationError, type TagPlusApiError, type TagPlusProduct } from "@/lib/tagplus/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
    let token = await getValidTagPlusAccessToken(user.id);
    let { response, payload } = await fetchProducts(token, query);
    if (response.status === 401) {
      token = await getValidTagPlusAccessToken(user.id, true);
      ({ response, payload } = await fetchProducts(token, query));
    }
    if (!response.ok) throw new TagPlusIntegrationError("TagPlus products request failed", response.status, payload as TagPlusApiError | undefined);
    return NextResponse.json(parseProductsResponse(payload));
  } catch (error) {
    return tagPlusErrorResponse(error, "Unable to fetch TagPlus products");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const input = await request.json().catch(() => null);
    if (!isUpdateInput(input)) return NextResponse.json({ error: "Produto ou alterações inválidas." }, { status: 400 });

    const changes = sanitizeTagPlusProductChanges(input.changes);
    if (Object.keys(changes).length === 0) return NextResponse.json({ error: "Nenhum campo editável foi alterado." }, { status: 400 });

    const updatePayload = buildTagPlusProductUpdatePayload(changes);
    let token = await getValidTagPlusAccessToken(user.id);
    let result = await patchProduct(token, input.id, updatePayload);
    if (result.response.status === 401) {
      token = await getValidTagPlusAccessToken(user.id, true);
      result = await patchProduct(token, input.id, changes);
    }
    if (!result.response.ok) throw new TagPlusIntegrationError("TagPlus product update failed", result.response.status, result.payload as TagPlusApiError | undefined);

    const updated = await fetchProduct(token, input.id);
    if (!updated.response.ok || !isProduct(updated.payload)) throw new TagPlusIntegrationError("Unable to reload updated TagPlus product", updated.response.status || 502, updated.payload as TagPlusApiError | undefined);
    const unappliedFields = getUnappliedTagPlusProductFields(updated.payload, changes);
    if (unappliedFields.length > 0) {
      throw new TagPlusIntegrationError("TagPlus did not persist every product change", 409, {
        error_code: "alteracoes_nao_persistidas",
        message: `O TagPlus não confirmou a alteração dos campos: ${unappliedFields.join(", ")}.`,
      });
    }
    return NextResponse.json(updated.payload);
  } catch (error) {
    return tagPlusErrorResponse(error, "Unable to update TagPlus product");
  }
}

async function fetchProducts(accessToken: string, query: string) {
  const url = new URL(`${TAGPLUS_API_BASE_URL}/produtos`);
  url.searchParams.set("fields", "*");
  url.searchParams.set("per_page", "100");
  if (query) url.searchParams.set("q", query);
  const response = await fetch(url, { headers: tagPlusHeaders(accessToken), cache: "no-store" });
  const payload: unknown = await response.json().catch(() => undefined);
  return { response, payload };
}

async function patchProduct(accessToken: string, id: string | number, changes: Record<string, unknown>) {
  const response = await fetch(`${TAGPLUS_API_BASE_URL}/produtos/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    headers: { ...tagPlusHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(changes),
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => undefined);
  return { response, payload };
}

async function fetchProduct(accessToken: string, id: string | number) {
  const url = new URL(`${TAGPLUS_API_BASE_URL}/produtos/${encodeURIComponent(String(id))}`);
  url.searchParams.set("fields", "*");
  const response = await fetch(url, { headers: tagPlusHeaders(accessToken), cache: "no-store" });
  const payload: unknown = await response.json().catch(() => undefined);
  return { response, payload };
}

function tagPlusHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "X-Api-Version": "2.0", Accept: "application/json" };
}

function isUpdateInput(value: unknown): value is { id: string | number; changes: Record<string, unknown> } {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (typeof input.id === "string" || typeof input.id === "number") && !!input.changes && typeof input.changes === "object" && !Array.isArray(input.changes);
}

function isProduct(value: unknown): value is TagPlusProduct {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function tagPlusErrorResponse(error: unknown, fallback: string) {
  const status = error instanceof TagPlusIntegrationError ? error.status : 500;
  const details = error instanceof TagPlusIntegrationError ? error.details : undefined;
  return NextResponse.json({ error: details?.message ?? (error instanceof Error ? error.message : fallback), errorCode: details?.error_code }, { status });
}
