import { NextResponse } from "next/server";
import { suggestAllocation } from "@/lib/inventory-allocation/service";
import type { ProductStoreMetrics } from "@/lib/inventory-allocation/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.incomingQuantity !== "number" || !Array.isArray(body.stores) || !body.stores.every(isStoreMetrics)) {
    return NextResponse.json({ error: "Dados de distribuição inválidos." }, { status: 400 });
  }
  try {
    const suggestion = await suggestAllocation({
      incomingQuantity: body.incomingQuantity,
      stores: body.stores,
      newCost: typeof body.newCost === "number" ? body.newCost : null,
      precision: typeof body.precision === "number" ? body.precision : undefined,
      useAi: body.useAi === true,
    });
    return NextResponse.json({ suggestion });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível sugerir a distribuição." }, { status: 422 });
  }
}

function isStoreMetrics(value: unknown): value is ProductStoreMetrics {
  if (!value || typeof value !== "object") return false;
  const store = value as Record<string, unknown>;
  return typeof store.storeId === "string" && typeof store.storeName === "string"
    && (store.provider === "cci" || store.provider === "tagplus")
    && typeof store.eligible === "boolean" && ["low", "medium", "high"].includes(String(store.dataQuality));
}

