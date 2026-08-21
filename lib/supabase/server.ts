import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(getSupabaseUrl(), getSupabasePublicKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Route handlers can read-only cookies. */ }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  return createClient(getSupabaseUrl(), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
