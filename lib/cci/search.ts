import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type SearchErpProductsInput = {
  userId: string;
  storeId: string;
  query: string;
  limit?: number;
};

export async function searchErpProducts(input: SearchErpProductsInput) {
  const supabase = createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await supabase
    .from("store_members")
    .select("store_id")
    .eq("store_id", input.storeId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (membershipError) throw new Error("Não foi possível validar o acesso à loja.");
  if (!membership) return [];

  const query = input.query.trim();
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  let productsQuery = supabase
    .from("erp_products")
    .select("id, external_id, description, sale_price, cost_price, stock, barcode, reference, location, supplier")
    .eq("store_id", input.storeId)
    .eq("provider", "cci")
    .limit(limit);

  if (query) productsQuery = productsQuery.ilike("description", `%${query}%`);

  const { data, error } = await productsQuery;
  if (error) throw new Error("Não foi possível buscar produtos do ERP.");
  return data ?? [];
}
