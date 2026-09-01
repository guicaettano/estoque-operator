import type { InventoryProvider } from "@/lib/inventory-allocation/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type OperationalStore = { id: string; name: string; provider: InventoryProvider };

export async function getOperationalStores(userId: string): Promise<OperationalStore[]> {
  const supabase = createSupabaseAdminClient();
  const { data: memberships, error: membershipError } = await supabase.from("store_members")
    .select("store_id").eq("user_id", userId).order("created_at", { ascending: true });
  if (membershipError) throw new Error("Não foi possível carregar as lojas do usuário.");
  const ids = (memberships ?? []).map((row) => String(row.store_id));
  if (!ids.length) return [];
  const { data, error } = await supabase.from("stores").select("id, name, provider").in("id", ids);
  if (error) throw new Error("Não foi possível carregar as integrações das lojas. Aplique a migração multi-loja.");
  const order = new Map(ids.map((id, index) => [id, index]));
  return (data ?? []).flatMap((row) => row.provider === "cci" || row.provider === "tagplus"
    ? [{ id: String(row.id), name: String(row.name), provider: row.provider as InventoryProvider }]
    : []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

