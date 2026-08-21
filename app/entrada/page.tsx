import { EntradaClient } from "@/app/entrada/entrada-client";
import { getProductProviderKind } from "@/lib/catalog/provider";

export const dynamic = "force-dynamic";

export default function EntradaPage() {
  return <EntradaClient providerKind={getProductProviderKind()} />;
}
