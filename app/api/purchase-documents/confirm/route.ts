import { NextResponse } from "next/server";
import { confirmPurchaseReview } from "@/lib/purchase-documents/review-service";
import type { ConfirmPurchaseReviewInput, PurchaseReviewDecision } from "@/lib/purchase-documents/review-types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getCurrentStoreId } from "@/lib/stores/current-store";

export const runtime = "nodejs";

function isDecision(value: unknown): value is PurchaseReviewDecision {
  if (!value || typeof value !== "object") return false;
  const decision = value as Record<string, unknown>; const item = decision.item as Record<string, unknown> | undefined;
  return !!item && typeof item.description === "string" && typeof item.quantity === "number" && typeof item.unitCost === "number"
    && ["matched", "manual_match", "new_product", "ignored"].includes(String(decision.status))
    && (decision.selectedProductId === null || typeof decision.selectedProductId === "string")
    && (decision.selectedExternalId === null || typeof decision.selectedExternalId === "string")
    && (decision.inventoryUpdatePlan === undefined || decision.inventoryUpdatePlan === null || isPlan(decision.inventoryUpdatePlan))
    && (decision.reviewTelemetry === undefined || isItemTelemetry(decision.reviewTelemetry));
}

function isPlan(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  return plan.status === "prepared" && typeof plan.incomingQuantity === "number" && Array.isArray(plan.allocations)
    && plan.allocations.every((entry) => !!entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).storeId === "string"
      && typeof (entry as Record<string, unknown>).allocatedQuantity === "number");
}

function isItemTelemetry(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const telemetry = value as Record<string, unknown>;
  return nullableString(telemetry.candidateInitiallySelected)
    && nullableString(telemetry.finalSelectedExternalId)
    && nullableRank(telemetry.initialRankAccepted)
    && ["manualSearchUsed", "noMatch", "newProduct"].every((field) => typeof telemetry[field] === "boolean")
    && nonNegativeNumber(telemetry.reviewDurationMs);
}

function isDocumentTelemetry(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const telemetry = value as Record<string, unknown>;
  return ["totalReviewDurationMs", "itemsProcessed", "top1AcceptedCount", "top2To5AcceptedCount", "manualSearchCount", "newProductCount", "noMatchCount"]
    .every((field) => nonNegativeNumber(telemetry[field]));
}

function nullableString(value: unknown) { return value === null || typeof value === "string"; }
function nullableRank(value: unknown) { return value === null || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10); }
function nonNegativeNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const body = await request.json().catch(() => null) as Partial<Omit<ConfirmPurchaseReviewInput, "userId">> | null;
  if (!body || !["cci", "multi_store"].includes(String(body.provider)) || typeof body.storeId !== "string"
    || typeof body.sourceFilename !== "string" || typeof body.supplierName !== "string"
    || !Array.isArray(body.decisions) || !body.decisions.every(isDecision)
    || (body.reviewTelemetry !== undefined && !isDocumentTelemetry(body.reviewTelemetry))) {
    return NextResponse.json({ error: "Dados da revisão inválidos." }, { status: 400 });
  }
  const storeId = await getCurrentStoreId(user.id);
  if (!storeId || storeId !== body.storeId) return NextResponse.json({ error: "Loja atual inválida." }, { status: 403 });
  try {
    const review = await confirmPurchaseReview({
      userId: user.id, storeId, provider: body.provider as "cci" | "multi_store", supplierName: body.supplierName,
      sourceFilename: body.sourceFilename, decisions: body.decisions, reviewTelemetry: body.reviewTelemetry,
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar a revisão." }, { status: 422 });
  }
}
