import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getProductProviderKind } from "@/lib/catalog/provider";
import { OperatorHeader } from "@/app/components/operator-header";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const providerKind = getProductProviderKind();

  return (
    <main className="operator-page">
      <OperatorHeader active="home" providerKind={providerKind} />
      <section className="dashboard-heading">
        <div><p className="eyebrow">Visão geral</p><h1>Olá, {user.email?.split("@")[0]}</h1><p>Organize novas compras e acompanhe as entradas já revisadas.</p></div>
        <Link className="button button-primary" href="/entrada">Nova entrada</Link>
      </section>
      <section className="dashboard-grid">
        <Link className="action-card action-card-primary" href="/entrada"><span className="action-index">01</span><div><p>Operação principal</p><h2>Processar nota de fornecedor</h2><span>PDF ou XML para uma tabela pronta para revisão</span></div><b aria-hidden="true">↗</b></Link>
        <Link className="action-card" href="/entradas"><span className="action-index">02</span><div><p>Histórico</p><h2>Consultar entradas confirmadas</h2><span>Veja tudo o que já foi salvo no catálogo local</span></div><b aria-hidden="true">↗</b></Link>
      </section>
      <section className="system-card"><div><span className="status-indicator" aria-hidden="true" /><div><strong>{providerKind === "local" ? "Catálogo local ativo" : "TagPlus conectado"}</strong><p>{providerKind === "local" ? "As confirmações ficam salvas no Supabase e não são enviadas ao TagPlus." : "O provedor TagPlus está disponível para a próxima etapa do projeto."}</p></div></div>{providerKind === "tagplus" ? <a className="button button-quiet" href="/api/integrations/tagplus/connect">Gerenciar conexão</a> : <span className="status-badge">Operacional</span>}</section>
    </main>
  );
}
