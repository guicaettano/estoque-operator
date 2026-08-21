import { LocalProductProvider, SupabaseLocalCatalogRepository, type LocalCatalogRepository } from "@/lib/catalog/local-product-provider";
import type { CatalogProduct } from "@/lib/catalog/types";
import { confirmProductReview, isProductReviewValid } from "@/lib/incoming-products/review";
import type { ConfirmIncomingEntryInput, IncomingEntryItemAction, PersistedIncomingEntry } from "@/lib/incoming-entries/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type EntryRow = { id: string; status: "review" | "confirmed" | "error"; confirmed_at: string | null };
type ItemRow = { id: string; matched_product_id: string; action: IncomingEntryItemAction };

export interface IncomingEntryRepository extends LocalCatalogRepository {
  createEntry(input: Pick<ConfirmIncomingEntryInput, "userId" | "supplierName" | "sourceFilename" | "source">): Promise<EntryRow>;
  createItems(input: Array<Record<string, unknown>>): Promise<ItemRow[]>;
  confirmEntry(entryId: string): Promise<EntryRow>;
  markEntryAsError?(entryId: string): Promise<void>;
}

export async function confirmIncomingEntry(input: ConfirmIncomingEntryInput, repository: IncomingEntryRepository = new SupabaseIncomingEntryRepository()): Promise<PersistedIncomingEntry> {
  if (!input.sourceFilename.trim()) throw new Error("Informe o nome do arquivo de origem.");
  if (!input.products.length) throw new Error("A entrada precisa conter ao menos um produto.");
  if (!input.products.every(isProductReviewValid)) {
    throw new Error("Revise lucro, preço e distribuição antes de confirmar a entrada.");
  }

  const entry = await repository.createEntry(input);
  try {
    const provider = new LocalProductProvider(repository);
    const itemPayloads: Array<Record<string, unknown>> = [];

    for (const review of input.products) {
      const product = confirmProductReview(review);
      const match = product.code ? await provider.getProductByCode(input.userId, product.code) : null;
      const catalogProduct = match
        ? await repository.findByCode(input.userId, product.code!)
        : await repository.create({
          userId: input.userId,
          code: product.code,
          name: product.description,
          unit: product.unit,
          cost: product.unitCost,
          salePrice: product.salePrice,
        });
      if (!catalogProduct) throw new Error("Não foi possível vincular o produto ao catálogo local.");

      itemPayloads.push(toItemRow(entry.id, product, catalogProduct, match ? "matched" : "created"));
    }

    const items = await repository.createItems(itemPayloads);
    const confirmedEntry = await repository.confirmEntry(entry.id);
    if (!confirmedEntry.confirmed_at) throw new Error("A entrada não recebeu data de confirmação.");
    return {
      id: entry.id,
      status: "confirmed",
      confirmedAt: confirmedEntry.confirmed_at,
      items: items.map((item, index) => ({
        id: item.id,
        matchedProductId: item.matched_product_id,
        action: item.action,
        product: confirmProductReview(input.products[index]),
      })),
    };
  } catch (error) {
    await repository.markEntryAsError?.(entry.id);
    throw error;
  }
}

function toItemRow(entryId: string, product: ReturnType<typeof confirmProductReview>, catalogProduct: CatalogProduct, action: IncomingEntryItemAction) {
  return {
    entry_id: entryId,
    incoming_code: product.code,
    incoming_description: product.description,
    final_name: catalogProduct.name,
    unit: product.unit,
    quantity: product.quantity,
    unit_cost: product.unitCost,
    profit_percentage: product.profitPercent,
    sale_price: product.salePrice,
    rr_motos_quantity: product.distribution.rrMotos,
    rr_autopecas_quantity: product.distribution.rrAutopecas,
    matched_product_id: catalogProduct.id,
    action,
  };
}

export class SupabaseIncomingEntryRepository extends SupabaseLocalCatalogRepository implements IncomingEntryRepository {
  async createEntry(input: Pick<ConfirmIncomingEntryInput, "userId" | "supplierName" | "sourceFilename" | "source">): Promise<EntryRow> {
    const { data, error } = await createSupabaseAdminClient()
      .from("incoming_entries")
      .insert({ user_id: input.userId, supplier_name: input.supplierName?.trim() || null, source_filename: input.sourceFilename.trim(), source: input.source, status: "review" })
      .select("id, status, confirmed_at")
      .single();
    if (error) throw new Error("Não foi possível criar a entrada.");
    return data as EntryRow;
  }

  async createItems(input: Array<Record<string, unknown>>): Promise<ItemRow[]> {
    const { data, error } = await createSupabaseAdminClient()
      .from("incoming_entry_items")
      .insert(input)
      .select("id, matched_product_id, action");
    if (error || !data) throw new Error("Não foi possível salvar os itens da entrada.");
    return data as ItemRow[];
  }

  async confirmEntry(entryId: string): Promise<EntryRow> {
    const { data, error } = await createSupabaseAdminClient()
      .from("incoming_entries")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", entryId)
      .select("id, status, confirmed_at")
      .single();
    if (error) throw new Error("Não foi possível confirmar a entrada.");
    return data as EntryRow;
  }

  async markEntryAsError(entryId: string): Promise<void> {
    await createSupabaseAdminClient().from("incoming_entries").update({ status: "error" }).eq("id", entryId);
  }
}
