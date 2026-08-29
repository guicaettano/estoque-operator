import type { ExternalProduct } from "@/lib/cci/types";
import type { CciCredential, CciSyncRepository } from "@/lib/cci/sync-service";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export class SupabaseCciSyncRepository implements CciSyncRepository {
  async findActiveCredential(tokenHash: string): Promise<CciCredential | null> {
    const { data, error } = await createSupabaseAdminClient()
      .from("cci_connector_credentials")
      .select("id, store_id")
      .eq("token_hash", tokenHash)
      .eq("active", true)
      .maybeSingle();

    if (error) throw new Error("Não foi possível autenticar o CCI Connector.");
    return data ? { id: String(data.id), storeId: String(data.store_id) } : null;
  }

  async upsertProducts(storeId: string, products: ExternalProduct[]): Promise<number> {
    if (products.length === 0) return 0;

    const syncedAt = new Date().toISOString();
    const rows = products.map((product) => ({
      store_id: storeId,
      provider: "cci",
      external_id: product.externalId,
      description: product.description,
      sale_price: product.salePrice,
      cost_price: product.costPrice,
      stock: product.stock,
      barcode: product.barcode,
      reference: product.reference,
      location: product.location,
      supplier: product.supplier,
      raw_data: product.rawData ?? null,
      synced_at: syncedAt,
    }));

    const { data, error } = await createSupabaseAdminClient()
      .from("erp_products")
      .upsert(rows, { onConflict: "store_id,provider,external_id" })
      .select("id");

    if (error) throw new Error("Não foi possível salvar os produtos CCI.");
    return data?.length ?? 0;
  }

  async markCredentialUsed(credentialId: string): Promise<void> {
    const { error } = await createSupabaseAdminClient()
      .from("cci_connector_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", credentialId);

    if (error) throw new Error("Não foi possível atualizar o uso da credencial CCI.");
  }
}
