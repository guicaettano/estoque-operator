"use client";

import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { OperatorHeader } from "@/app/components/operator-header";
import { PurchaseMatchingReview, type PurchaseReviewPayload } from "@/app/entrada/purchase-matching-review";
import type { ProductProviderKind } from "@/lib/catalog/types";
import { calculateProfitPercent, createProductReview, distributionMatchesQuantity, effectiveSalePrice, isProductReviewValid, splitDistributionEvenly } from "@/lib/incoming-products/review";
import type { IncomingDocumentStatus, IncomingProduct, ReviewedIncomingProduct } from "@/lib/incoming-products/types";

type DocumentSource = "pdf" | "xml";
type Confirmation = { id: string; confirmedAt: string; itemCount: number };

export function EntradaClient({ providerKind }: { providerKind: ProductProviderKind }) {
  const [pdf, setPdf] = useState<File | null>(null); const [xml, setXml] = useState<File | null>(null);
  const [supplierName, setSupplierName] = useState(""); const [source, setSource] = useState<DocumentSource | null>(null);
  const [products, setProducts] = useState<ReviewedIncomingProduct[]>([]); const [purchaseReview, setPurchaseReview] = useState<PurchaseReviewPayload | null>(null);
  const [status, setStatus] = useState<IncomingDocumentStatus>("uploaded"); const [error, setError] = useState<string | null>(null); const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const readyToConfirm = products.length > 0 && products.every(isProductReviewValid);
  const isProcessing = status === "processing";
  const summary = useMemo(() => products.reduce((value, product) => ({ units: value.units + product.quantity, pending: value.pending + (isProductReviewValid(product) ? 0 : 1) }), { units: 0, pending: 0 }), [products]);

  async function processDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pdf && !xml) return setError("Envie um PDF ou XML para processar.");
    setStatus("processing"); setError(null); const formData = new FormData(); if (pdf) formData.append("pdf", pdf); if (xml) formData.append("xml", xml); if (supplierName.trim()) formData.append("supplierName", supplierName.trim());
    const response = await fetch("/api/incoming-documents/process", { method: "POST", body: formData }); const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) { setStatus("error"); setError(readError(payload)); return; }
    if (isPurchasePayload(payload)) { setPurchaseReview(payload); setSupplierName(payload.supplier.name ?? ""); setProducts([]); setSource(payload.source); setStatus("review"); return; }
    if (!isProcessedPayload(payload)) { setStatus("error"); setError("Resposta inválida ao processar o documento."); return; }
    setPurchaseReview(null); setProducts(payload.products.map(createProductReview)); setSource(payload.source); setStatus("review");
  }

  function updateNumber(index: number, field: "quantity" | "unitCost" | "profitPercent" | "rrMotosQuantity" | "rrAutopecasQuantity", value: string) {
    setProducts((current) => current.map((product, position) => {
      if (position !== index) return product; const parsed = value === "" ? null : Number(value);
      if (field === "profitPercent" || field === "rrMotosQuantity" || field === "rrAutopecasQuantity") return field === "profitPercent" ? { ...product, [field]: parsed, salePriceOverride: null } : { ...product, [field]: parsed };
      if (parsed === null || !Number.isFinite(parsed)) return { ...product, [field]: Number.NaN };
      const updated = { ...product, [field]: parsed }; return field === "unitCost" && product.salePriceOverride !== null ? { ...updated, profitPercent: calculateProfitPercent(parsed, product.salePriceOverride) } : updated;
    }));
  }

  function updateSalePrice(index: number, value: string) { setProducts((current) => current.map((product, position) => position !== index ? product : value === "" ? { ...product, salePriceOverride: null } : { ...product, salePriceOverride: Number(value), profitPercent: calculateProfitPercent(product.unitCost, Number(value)) })); }
  function split(index: number) { setProducts((current) => current.map((product, position) => { if (position !== index) return product; const value = splitDistributionEvenly(product.quantity); return { ...product, rrMotosQuantity: value.rrMotos, rrAutopecasQuantity: value.rrAutopecas }; })); }

  async function confirmGenericReview() {
    if (!readyToConfirm || !source) return; setStatus("processing"); setError(null); const filename = source === "xml" ? xml?.name : pdf?.name;
    const response = await fetch("/api/incoming-entries/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFilename: filename, source, supplierName: supplierName || null, products }) });
    const payload: unknown = await response.json().catch(() => ({})); if (!response.ok || !isConfirmationPayload(payload)) { setStatus("review"); setError(readError(payload)); return; }
    setConfirmation({ id: payload.entry.id, confirmedAt: payload.entry.confirmedAt, itemCount: payload.entry.items.length }); setStatus("confirmed");
  }

  function reset() { setPdf(null); setXml(null); setSupplierName(""); setSource(null); setProducts([]); setPurchaseReview(null); setError(null); setConfirmation(null); setStatus("uploaded"); }

  return <main className="operator-page"><OperatorHeader active="entrada" providerKind={providerKind} />
    <section className="page-heading"><div><p className="eyebrow">Operação de estoque</p><h1>Entrada de mercadoria</h1><p>Extraia o pedido, encontre o SKU CCI e confirme cada sugestão.</p></div><ol className="flow-steps"><li className={status === "uploaded" || isProcessing ? "is-current" : "is-complete"}><span>1</span>Documento</li><li className={status === "review" ? "is-current" : status === "confirmed" ? "is-complete" : undefined}><span>2</span>Revisão</li><li className={status === "confirmed" ? "is-current" : undefined}><span>3</span>Confirmado</li></ol></section>
    {status !== "confirmed" && status !== "review" ? <form className="upload-panel" onSubmit={processDocument}><div className="panel-heading"><div><span className="section-number">01</span><div><h2>Documento da compra</h2><p>O pedido OSIAS usa texto digital; XML continua tendo prioridade quando enviado.</p></div></div></div><div className="upload-layout"><div className="upload-files"><FileField label="PDF da nota ou pedido" accept="application/pdf,.pdf" file={pdf} onChange={pickFile(setPdf)} /><FileField label="XML da NF-e" accept="application/xml,text/xml,.xml" file={xml} optional onChange={pickFile(setXml)} /></div><aside className="document-details"><label className="field supplier-field"><span>Fornecedor <em>opcional</em></span><input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Detectado automaticamente no pedido OSIAS" /></label><div className="privacy-note"><strong>CCI somente leitura</strong><p>Esta etapa consulta o catálogo sincronizado e nunca escreve no Firebird.</p></div></aside></div><div className="upload-actions"><span>{pdf || xml ? "Documento pronto para leitura" : "Selecione ao menos um documento"}</span><button className="button button-primary" type="submit" disabled={isProcessing}>{isProcessing ? "Processando e buscando matches..." : "Processar documento"}</button></div></form> : null}
    {status === "review" ? <button className="button button-quiet change-document" type="button" onClick={reset}>Trocar documento</button> : null}
    {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
    {status === "review" && purchaseReview ? <PurchaseMatchingReview payload={purchaseReview} filename={(purchaseReview.source === "xml" ? xml?.name : pdf?.name) ?? "documento"} onError={(message) => setError(message || null)} onConfirmed={(review) => { setConfirmation({ id: review.id, confirmedAt: review.confirmedAt, itemCount: review.itemCount }); setStatus("confirmed"); }} /> : null}
    {(status === "review" || isProcessing) && !purchaseReview && products.length ? <section className="review-panel"><div className="review-heading"><div><span className="section-number">02</span><div><h2>Revise os produtos</h2><p>Fluxo existente para XML e documentos genéricos.</p></div></div><div className="review-stats"><div><span>Produtos</span><strong>{products.length}</strong></div><div><span>Unidades</span><strong>{formatNumber(summary.units)}</strong></div><div><span>Pendências</span><strong>{summary.pending}</strong></div></div></div><div className="table-wrap"><table className="review-table"><thead><tr><th>Produto</th><th>Qtd.</th><th>Custo</th><th>Lucro %</th><th>Preço venda</th><th>RR MOTOS</th><th>RR AUTOPEÇAS</th></tr></thead><tbody>{products.map((product, index) => <GenericRow key={`${product.code}-${index}`} product={product} index={index} onNumber={updateNumber} onSalePrice={updateSalePrice} onSplit={split} />)}</tbody></table></div><footer className="review-footer"><p>{readyToConfirm ? "Todos os produtos estão prontos." : "Preencha preço, lucro e distribuição."}</p><button className="button button-primary" type="button" disabled={!readyToConfirm || isProcessing} onClick={confirmGenericReview}>{isProcessing ? "Salvando..." : "Confirmar entrada"}</button></footer></section> : null}
    {status === "confirmed" && confirmation ? <section className="success-panel"><div><p className="eyebrow">Revisão confirmada</p><h2>{confirmation.itemCount} itens salvos</h2><p>Registro concluído em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(confirmation.confirmedAt))}. Nenhuma escrita foi feita no CCI.</p></div><button className="button button-primary" type="button" onClick={reset}>Criar nova entrada</button></section> : null}
  </main>;
}

function GenericRow({ product, index, onNumber, onSalePrice, onSplit }: { product: ReviewedIncomingProduct; index: number; onNumber: (index: number, field: "quantity" | "unitCost" | "profitPercent" | "rrMotosQuantity" | "rrAutopecasQuantity", value: string) => void; onSalePrice: (index: number, value: string) => void; onSplit: (index: number) => void }) {
  const salePrice = effectiveSalePrice(product); const valid = distributionMatchesQuantity(product);
  return <tr><td className="product-cell"><strong>{product.description}</strong><small>{product.code ?? "Sem código"} · {product.unit ?? "Sem unidade"}</small></td><td><NumberField value={product.quantity} onChange={(value) => onNumber(index, "quantity", value)} /></td><td><NumberField value={product.unitCost} onChange={(value) => onNumber(index, "unitCost", value)} /></td><td><NumberField value={product.profitPercent} onChange={(value) => onNumber(index, "profitPercent", value)} /></td><td><NumberField value={product.salePriceOverride ?? salePrice} onChange={(value) => onSalePrice(index, value)} /></td><td><NumberField value={product.rrMotosQuantity} onChange={(value) => onNumber(index, "rrMotosQuantity", value)} /></td><td><NumberField value={product.rrAutopecasQuantity} onChange={(value) => onNumber(index, "rrAutopecasQuantity", value)} /><button className="split-button" type="button" onClick={() => onSplit(index)}>Dividir meio a meio</button>{!valid ? <small>A soma deve ser {formatNumber(product.quantity)}</small> : null}</td></tr>;
}

function FileField({ label, optional, accept, file, onChange }: { label: string; optional?: boolean; accept: string; file: File | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) { return <label className={`file-field ${file ? "has-file" : ""}`}><span className="file-type">{accept.includes("pdf") ? "PDF" : "XML"}</span><span className="file-copy"><strong>{file?.name ?? label}</strong><small>{file ? "Arquivo selecionado" : optional ? "Opcional" : "Clique para selecionar"}</small></span><input type="file" accept={accept} onChange={onChange} /><span className="file-action">{file ? "Trocar" : "Escolher"}</span></label>; }
function NumberField({ value, onChange }: { value: number | null; onChange: (value: string) => void }) { return <input className="compact-number" type="number" min="0" step="any" value={value ?? ""} onChange={(event) => onChange(event.target.value)} />; }
function isProcessedPayload(value: unknown): value is { products: IncomingProduct[]; source: DocumentSource } { return !!value && typeof value === "object" && Array.isArray((value as { products?: unknown }).products) && ["pdf", "xml"].includes(String((value as { source?: unknown }).source)); }
function isPurchasePayload(value: unknown): value is PurchaseReviewPayload { return !!value && typeof value === "object" && (value as { documentKind?: unknown }).documentKind === "purchase_order" && Array.isArray((value as { matches?: unknown }).matches) && typeof (value as { storeId?: unknown }).storeId === "string"; }
function isConfirmationPayload(value: unknown): value is { entry: { id: string; confirmedAt: string; items: unknown[] } } { return !!value && typeof value === "object" && !!(value as { entry?: unknown }).entry && Array.isArray((value as { entry: { items?: unknown } }).entry.items); }
function readError(value: unknown) { return !!value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string" ? (value as { error: string }).error : "Não foi possível concluir a operação."; }
function pickFile(setter: (file: File | null) => void) { return (event: ChangeEvent<HTMLInputElement>) => setter(event.target.files?.[0] ?? null); }
function formatNumber(value: number) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value); }
