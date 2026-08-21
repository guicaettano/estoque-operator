import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { calculateExpiresAt, isAccessTokenValid, refreshTagPlusToken } from "@/lib/tagplus/oauth";
import { TagPlusIntegrationError, type TagPlusConnection } from "@/lib/tagplus/types";

export async function getValidTagPlusAccessToken(userId: string, forceRefresh = false): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("tagplus_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new TagPlusIntegrationError("Unable to load TagPlus connection", 500);
  if (!data) throw new TagPlusIntegrationError("No TagPlus connection found", 404);
  const connection = data as TagPlusConnection;
  if (!forceRefresh && isAccessTokenValid(connection.expires_at)) return connection.access_token;

  const token = await refreshTagPlusToken(connection.refresh_token);
  const { error: updateError } = await supabase.from("tagplus_connections").update({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    expires_at: calculateExpiresAt(token.expires_in),
  }).eq("id", connection.id).eq("user_id", userId);
  if (updateError) throw new TagPlusIntegrationError("Unable to save refreshed TagPlus token", 500);
  return token.access_token;
}
