import { EntradaClient } from "@/app/entrada/entrada-client";
import { getProductProviderKind } from "@/lib/catalog/provider";
import "@/app/entrada/matching.css";
import "@/app/entrada/review-mvp.css";
import "@/app/entrada/allocation.css";

export const dynamic = "force-dynamic";

export default function EntradaPage() {
  return <EntradaClient providerKind={getProductProviderKind()} />;
}
