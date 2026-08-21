import { NextRequest, NextResponse } from "next/server";
import { confirmIncomingEntry } from "@/lib/incoming-entries/service";
import type { ConfirmIncomingEntryInput } from "@/lib/incoming-entries/types";
import type { ReviewedIncomingProduct } from "@/lib/incoming-products/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    const body: unknown = await request.json();
    if (!isConfirmPayload(body)) return NextResponse.json({ error: "Dados da entrada inválidos." }, { status: 400 });
    const entry = await confirmIncomingEntry({ ...body, userId: user.id });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar a entrada." }, { status: 422 });
  }
}

function isConfirmPayload(value: unknown): value is Omit<ConfirmIncomingEntryInput, "userId"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sourceFilename === "string"
    && (candidate.source === "pdf" || candidate.source === "xml")
    && Array.isArray(candidate.products)
    && candidate.products.every(isReviewedProduct);
}

function isReviewedProduct(value: unknown): value is ReviewedIncomingProduct {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.description === "string"
    && (item.code === null || typeof item.code === "string")
    && (item.unit === null || typeof item.unit === "string")
    && typeof item.quantity === "number"
    && typeof item.unitCost === "number"
    && (item.profitPercent === null || typeof item.profitPercent === "number")
    && (item.salePriceOverride === null || typeof item.salePriceOverride === "number")
    && (item.rrMotosQuantity === null || typeof item.rrMotosQuantity === "number")
    && (item.rrAutopecasQuantity === null || typeof item.rrAutopecasQuantity === "number");
}
