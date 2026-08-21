import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { TagPlusIntegrationError } from "@/lib/tagplus/types";

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new TagPlusIntegrationError("Authentication required", 401);
  return user;
}
