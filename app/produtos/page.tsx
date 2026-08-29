import { redirect } from "next/navigation";
import { ProductsClient } from "@/app/produtos/products-client";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return <ProductsClient />;
}
