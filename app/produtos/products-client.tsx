"use client";

import { type FormEvent, useMemo, useState } from "react";
import { OperatorHeader } from "@/app/components/operator-header";
import { TAGPLUS_EDITABLE_PRODUCT_FIELDS, getTagPlusProductCode, getTagPlusProductDescription, getTagPlusProductKey, getTagPlusProductStock } from "@/lib/tagplus/products";
import type { TagPlusProduct } from "@/lib/tagplus/types";

const NUMBER_FIELDS = new Set(["custo", "valor_custo", "custo_medio", "valor_venda", "preco_venda", "valor_venda_varejo", "estoque", "qtd_revenda", "quantidade_estoque", "saldo_estoque", "quantidade"]);

export function ProductsClient() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<TagPlusProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<TagPlusProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function searchProducts(searchQuery: string) {
    setLoading(true);
    setHasSearched(true);
    setError(null);

    try {
      const response = await fetch(`/api/integrations/tagplus/products?q=${encodeURIComponent(searchQuery.trim())}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isProductList(payload)) {
        setProducts([]); setSelectedProduct(null); setError(readError(payload, response.status)); return;
      }
      setProducts(payload); setSelectedProduct(null);
    } catch {
      setProducts([]); setSelectedProduct(null); setError("Não foi possível acessar o TagPlus. Verifique sua conexão e tente novamente.");
    } finally { setLoading(false); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchProducts(query);
  }

  function acceptUpdatedProduct(updated: TagPlusProduct) {
    setProducts((current) => current.map((product) => String(product.id) === String(updated.id) ? updated : product));
    setSelectedProduct(updated);
  }

  return <main className="operator-page">
    <OperatorHeader active="produtos" providerKind="tagplus" />
    <section className="products-heading"><div><p className="eyebrow">Catálogo integrado</p><h1>Produtos</h1><p>Consulte código, descrição e estoque. Selecione um produto para editar seus campos operacionais.</p></div><span className="products-count" aria-live="polite">{loading ? "Consultando…" : hasSearched ? `${products.length} ${products.length === 1 ? "resultado" : "resultados"}` : "Pronto para buscar"}</span></section>
    <form className="product-search" role="search" onSubmit={submitSearch}><label htmlFor="product-query">Código ou descrição</label><div><input id="product-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: 00125 ou Filtro de óleo" autoComplete="off" /><button className="button button-primary" type="submit" disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button></div></form>
    {error ? <div className="notice notice-error products-notice" role="alert">{error}</div> : null}
    {!error ? <section className="products-workspace" aria-busy={loading}>
      <div className="products-list" aria-label="Resultados da busca">{loading ? <ProductsLoading /> : products.length === 0 ? <ProductsEmpty hasQuery={Boolean(query.trim())} hasSearched={hasSearched} /> : products.map((product, index) => {
        const code = getTagPlusProductCode(product); const stock = getTagPlusProductStock(product); const selected = selectedProduct === product;
        return <button className={`product-result ${selected ? "is-selected" : ""}`} type="button" key={getTagPlusProductKey(product, index)} onClick={() => setSelectedProduct(product)} aria-pressed={selected}><span className="product-result-index">{String(index + 1).padStart(2, "0")}</span><span className="product-result-copy"><strong>{getTagPlusProductDescription(product)}</strong><small>{code ? `Código ${code}` : "Código não informado"}{stock !== null ? ` · Estoque ${formatStock(stock)}` : ""}</small></span><span className="product-result-arrow" aria-hidden="true">→</span></button>;
      })}</div>
      <aside className="product-details" aria-live="polite">{selectedProduct ? <ProductDetails key={getTagPlusProductKey(selectedProduct, 0)} product={selectedProduct} onSaved={acceptUpdatedProduct} /> : <div className="product-details-empty"><span aria-hidden="true">↗</span><h2>Selecione um produto</h2><p>Os campos editáveis e o registro completo do TagPlus aparecerão aqui.</p></div>}</aside>
    </section> : null}
  </main>;
}

function ProductDetails({ product, onSaved }: { product: TagPlusProduct; onSaved: (product: TagPlusProduct) => void }) {
  const editableEntries = Object.entries(product).filter(([field, value]) => TAGPLUS_EDITABLE_PRODUCT_FIELDS.has(field) && isScalar(value));
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() => Object.fromEntries(editableEntries.map(([field, value]) => [field, inputValue(value)])));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changes = useMemo(() => createChanges(product, draft), [product, draft]);
  const code = getTagPlusProductCode(product);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (product.id === undefined || Object.keys(changes).length === 0) return;
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      const response = await fetch("/api/integrations/tagplus/products", { method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ id: product.id, changes }) });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isProduct(payload)) { setSaveError(readUpdateError(payload, response.status)); return; }
      setDraft(Object.fromEntries(Object.entries(payload).filter(([field, value]) => TAGPLUS_EDITABLE_PRODUCT_FIELDS.has(field) && isScalar(value)).map(([field, value]) => [field, inputValue(value)])));
      setSaved(true); onSaved(payload);
    } catch { setSaveError("Não foi possível salvar as alterações no TagPlus."); }
    finally { setSaving(false); }
  }

  return <><div className="product-details-heading"><div><p className="eyebrow">Produto e estoque</p><h2>{getTagPlusProductDescription(product)}</h2><p>{code ? `Código ${code}` : "Sem código informado"}</p></div><a href="/api/integrations/tagplus/connect">Reconectar permissões</a></div>
    <form className="product-edit-form" onSubmit={saveProduct}>
      <div className="product-edit-heading"><div><h3>Campos editáveis</h3><p>As alterações são gravadas diretamente no TagPlus.</p></div><span>{Object.keys(changes).length} {Object.keys(changes).length === 1 ? "alteração" : "alterações"}</span></div>
      {editableEntries.length === 0 ? <p className="product-no-editable">Nenhum campo operacional editável foi retornado para este produto.</p> : <div className="product-edit-grid">{editableEntries.map(([field, original]) => <EditableField key={field} field={field} original={original} value={draft[field]} onChange={(value) => { setDraft((current) => ({ ...current, [field]: value })); setSaved(false); }} />)}</div>}
      {saveError ? <div className="notice notice-error" role="alert">{saveError}</div> : null}
      {saved ? <div className="notice notice-success" role="status">Produto atualizado no TagPlus.</div> : null}
      <div className="product-edit-actions"><p>O estoque só será alterado se o perfil do usuário no TagPlus tiver essa permissão.</p><button className="button button-primary" type="submit" disabled={saving || Object.keys(changes).length === 0 || product.id === undefined}>{saving ? "Salvando…" : "Salvar alterações"}</button></div>
    </form>
    <div className="product-raw-heading"><h3>Registro completo</h3><p>Campos internos permanecem somente leitura.</p></div><dl className="product-fields">{Object.entries(product).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{formatFieldValue(value)}</dd></div>)}</dl>
  </>;
}

function EditableField({ field, original, value, onChange }: { field: string; original: unknown; value: string | boolean; onChange: (value: string | boolean) => void }) {
  if (typeof original === "boolean" || field === "ativo") return <label className="product-edit-field product-toggle"><span>{field}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><b>{Boolean(value) ? "Sim" : "Não"}</b></label>;
  return <label className="product-edit-field"><span>{field}</span><input type={NUMBER_FIELDS.has(field) ? "number" : "text"} step={NUMBER_FIELDS.has(field) ? "any" : undefined} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} /></label>;
}

function createChanges(product: TagPlusProduct, draft: Record<string, string | boolean>): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(draft)) {
    const parsed = parseDraftValue(field, product[field], value);
    if (!Object.is(parsed, product[field])) changes[field] = parsed;
  }
  return changes;
}

function parseDraftValue(field: string, original: unknown, value: string | boolean): unknown {
  if (typeof original === "boolean" || field === "ativo") return Boolean(value);
  if (NUMBER_FIELDS.has(field)) {
    if (String(value).trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : original;
  }
  return String(value);
}

function inputValue(value: unknown): string | boolean { return typeof value === "boolean" ? value : value === null || value === undefined ? "" : String(value); }
function isScalar(value: unknown): boolean { return value === null || ["string", "number", "boolean"].includes(typeof value); }
function ProductsLoading() { return <div className="products-state" role="status"><span className="products-spinner" aria-hidden="true" /><strong>Consultando o TagPlus</strong><p>Aguarde enquanto carregamos catálogo e estoque.</p></div>; }
function ProductsEmpty({ hasQuery, hasSearched }: { hasQuery: boolean; hasSearched: boolean }) { if (!hasSearched) return <div className="products-state"><span className="empty-index">01</span><strong>Comece uma consulta</strong><p>Digite um código ou descrição. Deixe o campo vazio para listar até 100 produtos.</p></div>; return <div className="products-state"><span className="empty-index">00</span><strong>Nenhum produto encontrado</strong><p>{hasQuery ? "Tente outro código ou uma parte da descrição." : "O TagPlus não retornou produtos para esta conta."}</p></div>; }
function formatFieldValue(value: unknown): string { if (value === null) return "null"; if (value === undefined) return "—"; if (typeof value === "object") return JSON.stringify(value, null, 2); if (typeof value === "boolean") return value ? "true" : "false"; return String(value); }
function formatStock(value: string): string { const number = Number(value.replace(",", ".")); return Number.isFinite(number) ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(number) : value; }
function isProductList(value: unknown): value is TagPlusProduct[] { return Array.isArray(value) && value.every(isProduct); }
function isProduct(value: unknown): value is TagPlusProduct { return !!value && typeof value === "object" && !Array.isArray(value); }
function readError(value: unknown, status: number): string { if (status === 401) return "Sua sessão ou autorização do TagPlus expirou. Reconecte a integração."; if (status === 404) return "Nenhuma conexão com o TagPlus foi encontrada. Conecte sua conta na visão geral."; if (value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string") return (value as { error: string }).error; return "Não foi possível consultar os produtos no TagPlus."; }
function readUpdateError(value: unknown, status: number): string { const code = value && typeof value === "object" ? (value as { errorCode?: unknown }).errorCode : undefined; if (code === "escopo_nao_autorizado" || status === 401) return "Reconecte o TagPlus para conceder a permissão de editar produtos."; if (code === "permissao_alterar_estoque_produto") return "O usuário conectado não possui permissão para alterar estoque no Perfil de Acesso do TagPlus."; return readError(value, status); }
