"use client";

import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { OperatorHeader } from "@/app/components/operator-header";
import { calculateProfitPercent, createProductReview, distributionMatchesQuantity, effectiveSalePrice, isProductReviewValid, splitDistributionEvenly } from "@/lib/incoming-products/review";
import type { IncomingDocumentStatus, IncomingProduct, ReviewedIncomingProduct } from "@/lib/incoming-products/types";
import type { ProductProviderKind } from "@/lib/catalog/types";

type DocumentSource = "pdf" | "xml";
type Confirmation = { id: string; confirmedAt: string; itemCount: number };

export function EntradaClient({ providerKind }: { providerKind: ProductProviderKind }) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [source, setSource] = useState<DocumentSource | null>(null);
  const [products, setProducts] = useState<ReviewedIncomingProduct[]>([]);
  const [status, setStatus] = useState<IncomingDocumentStatus>("uploaded");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const readyToConfirm = products.length > 0 && products.every(isProductReviewValid);
  const isReadingDocument = status === "processing" && products.length === 0;
  const isSavingReview = status === "processing" && products.length > 0;
  const reviewSummary = useMemo(() => products.reduce((summary, product) => ({
    totalItems: summary.totalItems + product.quantity,
    pendingItems: summary.pendingItems + (isProductReviewValid(product) ? 0 : 1),
  }), { totalItems: 0, pendingItems: 0 }), [products]);

  async function processDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pdf && !xml) return setError("Envie um PDF ou XML para processar.");
    setStatus("processing"); setError(null);
    const formData = new FormData();
    if (pdf) formData.append("pdf", pdf);
    if (xml) formData.append("xml", xml);
    const response = await fetch("/api/incoming-documents/process", { method: "POST", body: formData });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok || !isProcessedPayload(payload)) { setStatus("error"); setError(readError(payload)); return; }
    setProducts(payload.products.map(createProductReview)); setSource(payload.source); setStatus("review");
  }

  function updateText(index: number, field: "code" | "description" | "unit", value: string) {
    setProducts((current) => current.map((product, itemIndex) => itemIndex === index ? { ...product, [field]: field === "description" ? value : value || null } : product));
  }

  function updateNumber(index: number, field: "quantity" | "unitCost" | "profitPercent" | "rrMotosQuantity" | "rrAutopecasQuantity", value: string) {
    setProducts((current) => current.map((product, itemIndex) => {
      if (itemIndex !== index) return product;
      const parsed = value === "" ? null : Number(value);
      if (field === "profitPercent" || field === "rrMotosQuantity" || field === "rrAutopecasQuantity") {
        const updated = { ...product, [field]: parsed };
        return field === "profitPercent" ? { ...updated, salePriceOverride: null } : updated;
      }
      if (parsed === null || !Number.isFinite(parsed)) return { ...product, [field]: Number.NaN };
      const updated = { ...product, [field]: parsed };
      return field === "unitCost" && product.salePriceOverride !== null ? { ...updated, profitPercent: calculateProfitPercent(parsed, product.salePriceOverride) } : updated;
    }));
  }

  function updateSalePrice(index: number, value: string) {
    setProducts((current) => current.map((product, itemIndex) => {
      if (itemIndex !== index) return product;
      if (value === "") return { ...product, salePriceOverride: null };
      const salePrice = Number(value);
      return { ...product, salePriceOverride: salePrice, profitPercent: calculateProfitPercent(product.unitCost, salePrice) };
    }));
  }

  function splitEvenly(index: number) {
    setProducts((current) => current.map((product, itemIndex) => {
      if (itemIndex !== index) return product;
      const split = splitDistributionEvenly(product.quantity);
      return { ...product, rrMotosQuantity: split.rrMotos, rrAutopecasQuantity: split.rrAutopecas };
    }));
  }

  async function confirmReview() {
    if (!readyToConfirm || !source) return setError("Revise todos os itens antes de confirmar a entrada.");
    setStatus("processing"); setError(null);
    const filename = source === "xml" ? xml?.name : pdf?.name;
    const response = await fetch("/api/incoming-entries/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFilename: filename, source, supplierName: supplierName || null, products }) });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok || !isConfirmationPayload(payload)) { setStatus("review"); setError(readError(payload)); return; }
    setConfirmation({ id: payload.entry.id, confirmedAt: payload.entry.confirmedAt, itemCount: payload.entry.items.length }); setStatus("confirmed");
  }

  function startNewEntry() { setPdf(null); setXml(null); setSupplierName(""); setSource(null); setProducts([]); setError(null); setConfirmation(null); setStatus("uploaded"); }

  return <main className="operator-page">
    <OperatorHeader active="entrada" providerKind={providerKind} />
    <section className="page-heading">
      <div><p className="eyebrow">Operação de estoque</p><h1>Entrada de mercadoria</h1><p>Extraia os itens da nota, revise preço e distribuição e salve no catálogo local.</p></div>
      <ol className="flow-steps" aria-label="Etapas da entrada">
        <li className={status === "uploaded" || isReadingDocument ? "is-current" : "is-complete"}><span>1</span>Documento</li>
        <li className={status === "review" || isSavingReview ? "is-current" : status === "confirmed" ? "is-complete" : undefined}><span>2</span>Revisão</li>
        <li className={status === "confirmed" ? "is-current" : undefined}><span>3</span>Confirmado</li>
      </ol>
    </section>
    {status !== "confirmed" && !isSavingReview ? <form className="upload-panel" onSubmit={processDocument}>
      <div className="panel-heading"><div><span className="section-number">01</span><div><h2>Documento da compra</h2><p>Envie o PDF e, se tiver, o XML. Dados estruturados têm prioridade.</p></div></div>{status === "review" ? <button className="button button-quiet" type="button" onClick={startNewEntry}>Trocar documento</button> : null}</div>
      <div className="upload-layout">
        <div className="upload-files"><FileField label="PDF da nota" accept="application/pdf,.pdf" file={pdf} onChange={pickFile(setPdf)} /><FileField label="XML da NF-e" optional accept="application/xml,text/xml,.xml" file={xml} onChange={pickFile(setXml)} /></div>
        <aside className="document-details"><label className="field supplier-field"><span>Fornecedor <em>opcional</em></span><input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Ex.: Distribuidora Central" /></label><div className="privacy-note"><strong>Processamento seguro</strong><p>Nenhum item será enviado ao TagPlus nesta etapa.</p></div></aside>
      </div>
      <div className="upload-actions"><div className="document-readiness"><span className={pdf || xml ? "is-ready" : undefined} aria-hidden="true" /><p>{pdf || xml ? "Documento pronto para leitura" : "Selecione ao menos um documento"}</p></div><button className="button button-primary" type="submit" disabled={isReadingDocument}>{isReadingDocument ? "Lendo documento..." : "Processar documento"}</button></div>
      {isReadingDocument ? <div className="processing-track" role="status"><span />Processando os itens da nota</div> : null}
    </form> : null}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {(status === "review" || isSavingReview) ? <section className="review-panel" aria-busy={isSavingReview}><div className="review-heading"><div><span className="section-number">02</span><div><h2>Revise os produtos</h2><p>Preço e lucro ficam sincronizados. A distribuição precisa fechar a quantidade comprada.</p></div></div><div className="review-stats"><div><span>Produtos</span><strong>{products.length}</strong></div><div><span>Unidades</span><strong>{formatQuantity(reviewSummary.totalItems)}</strong></div><div className={reviewSummary.pendingItems > 0 ? "has-pending" : "is-valid"}><span>Pendências</span><strong>{reviewSummary.pendingItems}</strong></div></div></div><div className="table-wrap"><table className="review-table"><thead><tr><th>Produto</th><th>Qtd.</th><th>Custo</th><th>Lucro %</th><th>Preço venda</th><th>RR MOTOS</th><th>RR AUTOPEÇAS</th></tr></thead><tbody>{products.map((product, index) => <ReviewRow key={`${product.code ?? "new"}-${index}`} index={index} product={product} onTextChange={updateText} onNumberChange={updateNumber} onSalePriceChange={updateSalePrice} onSplit={splitEvenly} />)}</tbody></table></div><footer className="review-footer"><div className={readyToConfirm ? "review-state is-valid" : "review-state"}><span aria-hidden="true" /><p>{isSavingReview ? "Salvando a entrada no catálogo local." : readyToConfirm ? "Todos os produtos estão prontos para salvar." : `${reviewSummary.pendingItems} ${reviewSummary.pendingItems === 1 ? "produto precisa" : "produtos precisam"} de revisão.`}</p></div><button className="button button-primary" type="button" disabled={!readyToConfirm || isSavingReview} onClick={confirmReview}>{isSavingReview ? "Salvando..." : "Confirmar entrada"}</button></footer></section> : null}
    {status === "confirmed" && confirmation ? <section className="success-panel"><div className="success-icon" aria-hidden="true"><span /></div><div><p className="eyebrow">Entrada confirmada</p><h2>{confirmation.itemCount} {confirmation.itemCount === 1 ? "produto salvo" : "produtos salvos"} no catálogo local</h2><p>Registro concluído em {formatDate(confirmation.confirmedAt)}. A integração com o TagPlus permanece desativada.</p></div><button className="button button-primary" type="button" onClick={startNewEntry}>Criar nova entrada</button></section> : null}
  </main>;
}

function ReviewRow({ index, product, onTextChange, onNumberChange, onSalePriceChange, onSplit }: { index: number; product: ReviewedIncomingProduct; onTextChange: (index: number, field: "code" | "description" | "unit", value: string) => void; onNumberChange: (index: number, field: "quantity" | "unitCost" | "profitPercent" | "rrMotosQuantity" | "rrAutopecasQuantity", value: string) => void; onSalePriceChange: (index: number, value: string) => void; onSplit: (index: number) => void }) {
  const salePrice = effectiveSalePrice(product); const distributionValid = distributionMatchesQuantity(product);
  return <tr className={!distributionValid ? "has-distribution-error" : undefined}><td className="product-cell" data-label="Produto"><input className="product-name" aria-label={`Produto ${index + 1}`} value={product.description} onChange={(event) => onTextChange(index, "description", event.target.value)} /><div className="product-meta"><input aria-label={`Código de ${product.description}`} value={product.code ?? ""} onChange={(event) => onTextChange(index, "code", event.target.value)} placeholder="Código" /><input aria-label={`Unidade de ${product.description}`} value={product.unit ?? ""} onChange={(event) => onTextChange(index, "unit", event.target.value)} placeholder="Unidade" /></div></td><td data-label="Qtd."><NumberInput label={`Quantidade de ${product.description}`} value={product.quantity} onChange={(value) => onNumberChange(index, "quantity", value)} /></td><td data-label="Custo"><NumberInput label={`Custo de ${product.description}`} value={product.unitCost} prefix="R$" step="0.01" onChange={(value) => onNumberChange(index, "unitCost", value)} /></td><td data-label="Lucro %"><NumberInput label={`Lucro de ${product.description}`} value={product.profitPercent} suffix="%" step="0.01" onChange={(value) => onNumberChange(index, "profitPercent", value)} /></td><td data-label="Preço venda"><NumberInput label={`Preço de venda de ${product.description}`} value={product.salePriceOverride ?? salePrice} prefix="R$" step="0.01" onChange={(value) => onSalePriceChange(index, value)} /></td><td data-label="RR MOTOS"><NumberInput label={`Quantidade RR MOTOS de ${product.description}`} value={product.rrMotosQuantity} onChange={(value) => onNumberChange(index, "rrMotosQuantity", value)} /></td><td data-label="RR AUTOPEÇAS"><div className="distribution-cell"><NumberInput label={`Quantidade RR AUTOPEÇAS de ${product.description}`} value={product.rrAutopecasQuantity} onChange={(value) => onNumberChange(index, "rrAutopecasQuantity", value)} invalid={!distributionValid} /><button className="split-button" type="button" onClick={() => onSplit(index)}>Dividir meio a meio</button>{!distributionValid ? <small>A soma deve ser {formatQuantity(product.quantity)}</small> : null}</div></td></tr>;
}

function FileField({ label, optional, accept, file, onChange }: { label: string; optional?: boolean; accept: string; file: File | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) { return <label className={`file-field ${file ? "has-file" : ""}`}><span className="file-type" aria-hidden="true">{accept.includes("pdf") ? "PDF" : "XML"}</span><span className="file-copy"><strong>{file?.name ?? label}</strong><small>{file ? `${formatFileSize(file.size)} selecionado` : `Clique para selecionar${optional ? " (opcional)" : ""}`}</small></span><input type="file" accept={accept} onChange={onChange} /><span className="file-action">{file ? "Trocar" : "Escolher"}</span></label>; }
function NumberInput({ label, value, prefix, suffix, step = "any", onChange, invalid }: { label: string; value: number | null; prefix?: string; suffix?: string; step?: string; onChange: (value: string) => void; invalid?: boolean }) { return <label className={`number-input ${invalid ? "is-invalid" : ""}`}><span className="sr-only">{label}</span>{prefix && <b>{prefix}</b>}<input aria-label={label} type="number" min="0" step={step} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />{suffix && <b>{suffix}</b>}</label>; }
function isProcessedPayload(value: unknown): value is { products: IncomingProduct[]; source: DocumentSource } { return !!value && typeof value === "object" && Array.isArray((value as { products?: unknown }).products) && ((value as { source?: unknown }).source === "pdf" || (value as { source?: unknown }).source === "xml"); }
function isConfirmationPayload(value: unknown): value is { entry: { id: string; confirmedAt: string; items: unknown[] } } { return !!value && typeof value === "object" && !!(value as { entry?: unknown }).entry && typeof ((value as { entry: { id?: unknown } }).entry.id) === "string" && Array.isArray((value as { entry: { items?: unknown } }).entry.items); }
function readError(value: unknown): string { return !!value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string" ? (value as { error: string }).error : "Não foi possível concluir esta operação."; }
function pickFile(setter: (file: File | null) => void) { return (event: ChangeEvent<HTMLInputElement>) => setter(event.target.files?.[0] ?? null); }
function formatQuantity(value: number): string { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value); }
function formatFileSize(value: number): string { return new Intl.NumberFormat("pt-BR", { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(value / 1024 / 1024); }
function formatDate(value: string): string { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
