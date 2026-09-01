import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function getCurrentStoreId(userId: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("store_members")
    .select("store_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível resolver a loja atual.");
  return data ? String(data.store_id) : null;
}
