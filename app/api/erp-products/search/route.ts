import { NextRequest, NextResponse } from "next/server";
import { retrieveProductCandidates } from "@/lib/product-matching/retrieval";
import { getOperationalStores } from "@/lib/stores/operational-stores";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const storeId = request.nextUrl.searchParams.get("storeId")?.trim() ?? "";
  const provider = request.nextUrl.searchParams.get("provider")?.trim() ?? "";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  if (query.length < 2) return NextResponse.json({ candidates: [] });
  if (!storeId || (provider !== "cci" && provider !== "tagplus")) {
    return NextResponse.json({ error: "Loja e provider são obrigatórios." }, { status: 400 });
  }

  const stores = await getOperationalStores(user.id);
  if (!stores.some((store) => store.id === storeId && store.provider === provider)) {
    return NextResponse.json({ error: "A loja informada não pertence ao usuário ou ao provider selecionado." }, { status: 403 });
  }

  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10) : 10;
  try {
    const candidates = await retrieveProductCandidates({
      storeId,
      provider,
      limit,
      item: { supplierCode: null, supplierReference: null, description: query, quantity: 1, unitCost: 0, total: null },
    });
    return NextResponse.json({ candidates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Busca indisponível." }, { status: 422 });
  }
}
