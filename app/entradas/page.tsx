import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { OperatorHeader } from "@/app/components/operator-header";

export const dynamic = "force-dynamic";

type EntryRow = { id: string; supplier_name: string | null; source_filename: string; source: "pdf" | "xml"; status: string; created_at: string; confirmed_at: string | null; incoming_entry_items: Array<{ id: string }> };

export default async function EntradasPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const { data } = await createSupabaseAdminClient().from("incoming_entries").select("id, supplier_name, source_filename, source, status, created_at, confirmed_at, incoming_entry_items(id)").eq("user_id", user.id).order("created_at", { ascending: false });
  const entries = (data ?? []) as EntryRow[];
  return <main className="operator-page">
    <OperatorHeader active="entradas" />
    <section className="history-heading"><div><p className="eyebrow">Histórico</p><h1>Entradas confirmadas</h1><p>Consulte as notas revisadas e salvas no catálogo local.</p></div><Link className="button button-primary" href="/entrada">Nova entrada</Link></section>
    <section className="history-list"><div className="history-table-head"><span>Fornecedor e documento</span><span>Conteúdo</span><span>Status</span></div>{entries.length === 0 ? <div className="empty-history"><span className="empty-index">00</span><h2>Nenhuma entrada confirmada</h2><p>Quando você confirmar uma nota, ela aparecerá aqui com fornecedor, itens e data.</p><Link className="button button-primary" href="/entrada">Processar primeira nota</Link></div> : entries.map((entry) => <article className="history-row" key={entry.id}><div><strong>{entry.supplier_name || "Fornecedor não informado"}</strong><span>{entry.source_filename}</span></div><div><strong>{entry.incoming_entry_items.length} {entry.incoming_entry_items.length === 1 ? "item" : "itens"}</strong><small>Origem {entry.source.toUpperCase()}</small></div><div><span className="history-status"><i aria-hidden="true" />{entry.status === "confirmed" ? "Confirmada" : entry.status}</span><small>{formatDate(entry.confirmed_at ?? entry.created_at)}</small></div></article>)}</section>
  </main>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
