import type { ProductStoreMetrics } from "@/lib/inventory-allocation/types";
import { assertValidAllocationSuggestion } from "@/lib/inventory-allocation/validation";
import type { ConfirmPurchaseReviewInput } from "@/lib/purchase-documents/review-types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function confirmPurchaseReview(input: ConfirmPurchaseReviewInput) {
  if (!input.decisions.length) throw new Error("A revisão precisa conter ao menos um item.");
  const supabase = createSupabaseAdminClient();
  const selectedIds = [...new Set(input.decisions.map((decision) => decision.selectedProductId).filter((id): id is string => !!id))];
  if (selectedIds.length) {
    const { data, error } = await supabase.from("erp_products").select("id, external_id")
      .eq("store_id", input.storeId).eq("provider", "cci").in("id", selectedIds);
    if (error || !data || data.length !== selectedIds.length) throw new Error("Um produto selecionado não pertence ao catálogo CCI da loja atual.");
    const valid = new Map(data.map((row) => [String(row.id), String(row.external_id)]));
    if (input.decisions.some((decision) => decision.selectedProductId && valid.get(decision.selectedProductId) !== decision.selectedExternalId)) {
      throw new Error("A identificação do produto selecionado é inválida.");
    }
  }

  const allocationStoreIds = [...new Set(input.decisions.flatMap((decision) => decision.inventoryUpdatePlan?.allocations.map((item) => item.storeId) ?? []))];
  if (allocationStoreIds.length) {
    const { data, error } = await supabase.from("store_members").select("store_id").eq("user_id", input.userId).in("store_id", allocationStoreIds);
    if (error || !data || data.length !== allocationStoreIds.length) throw new Error("Uma loja da distribuição não pertence ao usuário atual.");
  }
  for (const decision of input.decisions) validatePlan(decision.inventoryUpdatePlan ?? null);

  const confirmedAt = new Date().toISOString();
  const { data: review, error: reviewError } = await supabase.from("purchase_document_reviews").insert({
    store_id: input.storeId, user_id: input.userId, provider: input.provider, supplier_name: input.supplierName,
    source_filename: input.sourceFilename, status: "confirmed", confirmed_at: confirmedAt,
  }).select("id").single();
  if (reviewError || !review) throw new Error("Não foi possível salvar a revisão do pedido.");

  const rows = input.decisions.map((decision) => ({
    document_id: review.id, supplier_code: decision.item.supplierCode, supplier_reference: decision.item.supplierReference,
    incoming_description: decision.item.description, quantity: decision.item.quantity, unit_cost: decision.item.unitCost,
    line_total: decision.item.total, raw_text: decision.item.rawText ?? null, status: decision.status,
    selected_product_id: decision.selectedProductId, selected_external_id: decision.selectedExternalId,
    deterministic_score: decision.deterministicScore, ai_confidence: decision.aiConfidence, match_method: decision.matchMethod,
    inventory_update_plan: decision.inventoryUpdatePlan ? {
      ...decision.inventoryUpdatePlan,
      reviewTelemetry: decision.reviewTelemetry ?? null,
      documentReviewTelemetry: input.reviewTelemetry ?? null,
    } : null,
  }));
  const { data: savedItems, error: itemsError } = await supabase.from("purchase_document_review_items").insert(rows).select("id");
  if (itemsError || !savedItems || savedItems.length !== rows.length) {
    await supabase.from("purchase_document_reviews").delete().eq("id", review.id);
    throw new Error("Não foi possível salvar os itens revisados.");
  }

  const allocations = input.decisions.flatMap((decision, index) => {
    const plan = decision.inventoryUpdatePlan;
    if (!plan) return [];
    return plan.allocations.map((allocation) => ({
      review_item_id: savedItems[index].id, store_id: allocation.storeId, store_name: allocation.storeName,
      provider: allocation.provider, product_id: allocation.productId, external_id: allocation.externalId,
      product_description: allocation.productDescription, current_stock: allocation.currentStock,
      sales_7d: allocation.sales7d, sales_30d: allocation.sales30d, sales_90d: allocation.sales90d,
      avg_daily_sales_30d: allocation.avgDailySales30d, days_of_cover: allocation.daysOfCover,
      last_sale_at: allocation.lastSaleAt, data_quality: allocation.dataQuality,
      suggested_quantity: allocation.suggestedQuantity, allocated_quantity: allocation.allocatedQuantity,
      predicted_stock: allocation.predictedStock, current_cost: allocation.currentCost, new_cost: allocation.newCost,
      current_sale_price: allocation.currentSalePrice, new_sale_price: allocation.newSalePrice,
      allocation_method: allocation.allocationMethod, necessity_score: allocation.necessityScore,
      necessity_level: allocation.necessityLevel, reason: allocation.reason, confidence: allocation.confidence,
      requires_product_creation: allocation.requiresProductCreation,
      suggestion_accepted: allocation.allocatedQuantity === allocation.suggestedQuantity,
    }));
  });
  if (allocations.length) {
    const { error } = await supabase.from("purchase_document_allocations").insert(allocations);
    if (error) {
      await supabase.from("purchase_document_reviews").delete().eq("id", review.id);
      throw new Error("Não foi possível salvar a distribuição entre lojas.");
    }
  }
  return { id: String(review.id), confirmedAt, itemCount: rows.length, allocationCount: allocations.length };
}

function validatePlan(plan: ConfirmPurchaseReviewInput["decisions"][number]["inventoryUpdatePlan"] | null) {
  if (!plan) return;
  const stores: ProductStoreMetrics[] = plan.allocations.map((allocation) => ({ ...allocation }));
  assertValidAllocationSuggestion({
    incomingQuantity: plan.incomingQuantity,
    precision: 4,
    method: plan.allocations.some((allocation) => allocation.allocationMethod === "ai") ? "ai" : "deterministic",
    allocations: plan.allocations,
    explanation: "Plano confirmado pelo operador.", aiCalled: false, fallbackReason: null,
  }, stores);
}
