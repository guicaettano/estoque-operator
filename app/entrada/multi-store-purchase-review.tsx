"use client";

import { type FormEvent, useState } from "react";
import { buildInventoryUpdatePlan } from "@/lib/inventory-allocation/plan";
import type { AllocationSuggestion, StoreAllocation } from "@/lib/inventory-allocation/types";
import type { ProductCandidate, ProductMatchResult, ReviewItemStatus } from "@/lib/product-matching/types";
import type { MultiStoreItemReview, MultiStoreItemStore } from "@/lib/purchase-documents/multi-store";
import { summarizeDocumentReview } from "@/lib/purchase-documents/review-telemetry";
import type { ItemReviewTelemetry, PurchaseReviewDecision } from "@/lib/purchase-documents/review-types";
import type { DetectedSupplier } from "@/lib/purchase-documents/types";
import type { OperationalStore } from "@/lib/stores/operational-stores";

export type PurchaseReviewPayload = {
  documentKind: "purchase_order";
  source: "pdf" | "xml";
  provider: "cci" | "multi_store";
  storeId: string;
  stores: OperationalStore[];
  supplier: DetectedSupplier;
  itemCount: number;
  multiStoreItems?: MultiStoreItemReview[];
  matches: ProductMatchResult[];
};

type StoreTelemetryState = {
  candidateInitiallySelected: string | null;
  initialRankAccepted: number | null;
  manualSearchUsed: boolean;
  noMatch: boolean;
  newProduct: boolean;
};
type ReviewItem = MultiStoreItemReview & {
  confirmed: boolean;
  reviewStartedAt: number;
  reviewDurationMs: number | null;
  telemetry: Record<string, StoreTelemetryState>;
};
type ChoiceMeta = { initialRank: number | null; manualSearchUsed?: boolean };

export function MultiStorePurchaseReview({ payload, filename, onConfirmed, onError }: {
  payload: PurchaseReviewPayload;
  filename: string;
  onConfirmed: (result: { id: string; confirmedAt: string; itemCount: number }) => void;
  onError: (message: string) => void;
}) {
  const [documentStartedAt] = useState(() => Date.now());
  const [items, setItems] = useState<ReviewItem[]>(() => createReviewItems(payload.multiStoreItems ?? []));
  const [saving, setSaving] = useState(false);
  const confirmedCount = items.filter((item) => item.confirmed).length;

  const update = (index: number, transform: (item: ReviewItem) => ReviewItem) => {
    setItems((current) => current.map((item, position) => position === index ? transform(item) : item));
  };
  const changeStore = (index: number, storeId: string, transform: (store: MultiStoreItemStore) => MultiStoreItemStore) => {
    update(index, (item) => ({
      ...item,
      confirmed: false,
      reviewDurationMs: null,
      stores: item.stores.map((store) => store.storeId === storeId ? transform(store) : store),
    }));
  };
  const choose = (index: number, storeId: string, candidate: ProductCandidate | null, status: ReviewItemStatus, meta: ChoiceMeta) => {
    update(index, (item) => {
      const previousTelemetry = item.telemetry[storeId];
      return {
        ...item,
        confirmed: false,
        reviewDurationMs: null,
        stores: item.stores.map((store) => store.storeId === storeId ? selectedStore(store, candidate, status) : store),
        telemetry: {
          ...item.telemetry,
          [storeId]: {
            ...previousTelemetry,
            initialRankAccepted: candidate ? meta.initialRank : null,
            manualSearchUsed: previousTelemetry.manualSearchUsed || Boolean(meta.manualSearchUsed),
            noMatch: candidate === null,
            newProduct: status === "new_product",
          },
        },
      };
    });
  };
  const markManualSearch = (index: number, storeId: string) => update(index, (item) => ({
    ...item,
    confirmed: false,
    reviewDurationMs: null,
    telemetry: {
      ...item.telemetry,
      [storeId]: { ...item.telemetry[storeId], manualSearchUsed: true },
    },
  }));
  const edit = (index: number, storeId: string, field: "allocatedQuantity" | "newCost" | "newSalePrice", value: number | null) => {
    changeStore(index, storeId, (store) => ({
      ...store,
      [field]: value,
      predictedStock: field === "allocatedQuantity"
        ? store.currentStock === null || value === null ? null : store.currentStock + value
        : store.predictedStock,
      allocationMethod: field === "allocatedQuantity" ? "manual" : store.allocationMethod,
    }));
  };
  const accept = (index: number) => update(index, (item) => ({
    ...item,
    confirmed: false,
    reviewDurationMs: null,
    stores: item.stores.map((store) => ({
      ...store,
      allocatedQuantity: store.suggestedQuantity,
      predictedStock: store.currentStock === null ? null : store.currentStock + store.suggestedQuantity,
    })),
  }));

  function confirmItem(index: number) {
    const item = items[index];
    const total = sum(item.stores);
    if (total !== item.item.quantity) return onError(`Distribua exatamente ${formatNumber(item.item.quantity)} unidades antes de confirmar.`);
    if (item.stores.some((store) => store.allocatedQuantity > 0 && !["matched", "manual_match", "new_product"].includes(store.decisionStatus))) {
      return onError("Confirme o match ou marque Produto novo em cada loja que receber quantidade.");
    }
    update(index, (current) => ({ ...current, confirmed: true, reviewDurationMs: Date.now() - current.reviewStartedAt }));
    onError("");
  }

  async function save() {
    if (confirmedCount !== items.length) return onError("Confirme todos os itens antes de concluir.");
    setSaving(true);
    onError("");
    const itemTelemetry = items.map(toItemTelemetry);
    const documentTelemetry = summarizeDocumentReview(itemTelemetry, Date.now() - documentStartedAt);
    const decisions: PurchaseReviewDecision[] = items.map((item, index) => {
      const cci = item.stores.find((store) => store.provider === "cci");
      if (!cci) throw new Error("Alocação CCI ausente.");
      const status = cci.decisionStatus as Exclude<ReviewItemStatus, "pending">;
      const candidate = cci.candidates.find((entry) => entry.productId === cci.selectedProductId);
      return {
        item: item.item,
        status,
        selectedProductId: cci.selectedProductId,
        selectedExternalId: cci.selectedExternalId,
        deterministicScore: candidate?.deterministicScore ?? null,
        aiConfidence: candidate?.aiConfidence ?? null,
        matchMethod: status === "manual_match" ? "manual" : status === "matched" ? cci.method : null,
        inventoryUpdatePlan: buildInventoryUpdatePlan({ supplierCode: item.item.supplierCode, incomingDescription: item.item.description, suggestion: suggestion(item) }),
        reviewTelemetry: itemTelemetry[index],
      };
    });
    const response = await fetch("/api/purchase-documents/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: payload.storeId, provider: "multi_store", supplierName: payload.supplier.name, sourceFilename: filename, decisions, reviewTelemetry: documentTelemetry }),
    });
    const body = await response.json().catch(() => ({})) as { review?: { id: string; confirmedAt: string; itemCount: number }; error?: string };
    setSaving(false);
    if (!response.ok || !body.review) return onError(body.error ?? "Não foi possível salvar a revisão.");
    onConfirmed(body.review);
  }

  if (!items.length) return <section className="matching-review"><p className="no-match">A resposta não trouxe alocações por loja. Reprocesse o documento após atualizar o deployment.</p></section>;
  return <section className="matching-review" aria-busy={saving}>
    <header className="matching-summary">
      <div><span className="section-number">02</span><div><p className="eyebrow">Documento normalizado</p><h2>{payload.supplier.name ?? "Fornecedor não identificado"}</h2><p>{items.length} itens · {payload.stores.length} lojas operacionais.</p></div></div>
      <div className="matching-progress"><strong>{confirmedCount}/{items.length}</strong><span>itens confirmados</span></div>
    </header>
    <div className="matching-list">{items.map((item, index) => <ItemCard
      key={`${item.item.supplierCode}-${index}`}
      item={item}
      index={index}
      onChoose={(storeId, candidate, status, meta) => choose(index, storeId, candidate, status, meta)}
      onManualSearch={(storeId) => markManualSearch(index, storeId)}
      onEdit={(storeId, field, value) => edit(index, storeId, field, value)}
      onAccept={() => accept(index)}
      onConfirm={() => confirmItem(index)}
    />)}</div>
    <footer className="review-footer"><p>{confirmedCount === items.length ? "Plano pronto para salvar; nenhum ERP será alterado." : "Confirme match e distribuição para cada item."}</p><button className="button button-primary" type="button" disabled={saving || confirmedCount !== items.length} onClick={save}>{saving ? "Salvando..." : "Concluir revisão"}</button></footer>
  </section>;
}

function ItemCard({ item, index, onChoose, onManualSearch, onEdit, onAccept, onConfirm }: {
  item: ReviewItem;
  index: number;
  onChoose: (storeId: string, candidate: ProductCandidate | null, status: ReviewItemStatus, meta: ChoiceMeta) => void;
  onManualSearch: (storeId: string) => void;
  onEdit: (storeId: string, field: "allocatedQuantity" | "newCost" | "newSalePrice", value: number | null) => void;
  onAccept: () => void;
  onConfirm: () => void;
}) {
  const total = sum(item.stores);
  const valid = total === item.item.quantity;
  return <article className={`match-item ${item.confirmed ? "is-resolved" : ""}`}>
    <header><div><span className="match-index">{String(index + 1).padStart(2, "0")}</span><div><h3>{item.item.description}</h3><p>Código fornecedor: <strong>{item.item.supplierCode ?? "—"}</strong></p></div></div><span className="decision-badge">{item.confirmed ? "Confirmado" : "Pendente"}</span></header>
    <div className="incoming-facts"><div><span>Quantidade recebida</span><strong>{formatNumber(item.item.quantity)}</strong></div><div><span>Custo nota</span><strong>{formatMoney(item.item.unitCost)}</strong></div></div>
    <section className="distribution-panel">
      <header><div><p className="eyebrow">Distribuição sugerida</p><h4>{item.explanation}</h4></div><span className={valid ? "allocation-total is-valid" : "allocation-total"}>{formatNumber(total)} / {formatNumber(item.item.quantity)}</span></header>
      <p className="allocation-warning">Dados de giro limitados quando indisponíveis; a sugestão é baseada nos dados disponíveis.</p>
      <div className="allocation-grid">{item.stores.map((store) => <StoreCard key={store.storeId} store={store} query={item.item.description} onChoose={(candidate, status, meta) => onChoose(store.storeId, candidate, status, meta)} onManualSearch={() => onManualSearch(store.storeId)} onEdit={(field, value) => onEdit(store.storeId, field, value)} />)}</div>
      <div className="distribution-actions"><button className="button button-quiet" type="button" onClick={onAccept}>✨ Distribuir automaticamente</button><button className="button button-primary" type="button" disabled={!valid} onClick={onConfirm}>{item.confirmed ? "Item confirmado" : "Confirmar item"}</button></div>
    </section>
    {process.env.NODE_ENV === "development" ? <MatchingDebug item={item} /> : null}
  </article>;
}

function StoreCard({ store, query, onChoose, onManualSearch, onEdit }: {
  store: MultiStoreItemStore;
  query: string;
  onChoose: (candidate: ProductCandidate | null, status: ReviewItemStatus, meta: ChoiceMeta) => void;
  onManualSearch: () => void;
  onEdit: (field: "allocatedQuantity" | "newCost" | "newSalePrice", value: number | null) => void;
}) {
  const [expandedCandidates, setExpandedCandidates] = useState<ProductCandidate[] | null>(null);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<ProductCandidate[]>([]);
  const [loading, setLoading] = useState<"more" | "manual" | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const displayedCandidates = expandedCandidates ?? store.candidates.slice(0, 3);
  const selected = uniqueCandidates([...displayedCandidates, ...manualResults, ...store.candidates]).find((candidate) => candidate.productId === store.selectedProductId) ?? null;
  const statusLabel = decisionLabel(store.status);

  async function loadMore() {
    if (expandedCandidates) return setExpandedCandidates(null);
    setLoading("more");
    setSearchError(null);
    try {
      setExpandedCandidates(await searchCatalog(store, query));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Busca indisponível.");
    } finally {
      setLoading(null);
    }
  }

  async function manualSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualQuery.trim().length < 2) return setSearchError("Digite ao menos 2 caracteres.");
    onManualSearch();
    setLoading("manual");
    setSearchError(null);
    try {
      setManualResults(await searchCatalog(store, manualQuery.trim()));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Busca indisponível.");
    } finally {
      setLoading(null);
    }
  }

  return <article className="allocation-card">
    <header><div><strong>{store.storeName}</strong><span>{store.provider.toUpperCase()}</span></div><b className={`decision-badge match-status-${store.status.toLowerCase()}`}>{statusLabel}</b></header>

    {displayedCandidates.length ? <div className="candidate-options"><CandidateList candidates={displayedCandidates} store={store} selectedProductId={selected?.productId ?? null} onChoose={(candidate, rank) => onChoose(candidate, rank === 1 && store.method !== "ai_reranked" ? "matched" : "manual_match", { initialRank: rank })} /></div> : <div className="no-match"><strong>Nenhum produto correspondente encontrado.</strong><p>Use a busca manual ou cadastre o item como produto novo.</p></div>}

    <div className="match-actions">
      <button className="button button-quiet" type="button" disabled={loading !== null} onClick={loadMore}>{loading === "more" ? "Buscando..." : expandedCandidates ? "Mostrar somente Top 3" : "Ver mais candidatos"}</button>
      <button className="button button-quiet" type="button" onClick={() => setManualSearchOpen((current) => !current)}>Buscar manualmente</button>
      <button className="button button-quiet" type="button" onClick={() => onChoose(null, "new_product", { initialRank: null })}>Produto novo</button>
    </div>

    {manualSearchOpen ? <form className="manual-search" onSubmit={manualSearch}>
      <div><input value={manualQuery} onChange={(event) => setManualQuery(event.target.value)} placeholder={`Buscar somente em ${store.storeName}`} aria-label={`Buscar produto em ${store.storeName}`} /><button className="button button-quiet" type="submit" disabled={loading !== null}>{loading === "manual" ? "Buscando..." : "Buscar"}</button></div>
      {manualResults.length ? <div className="manual-results"><CandidateList candidates={manualResults} store={store} selectedProductId={selected?.productId ?? null} manual onChoose={(candidate) => onChoose(candidate, "manual_match", { initialRank: null, manualSearchUsed: true })} /></div> : null}
      {!loading && manualQuery && !manualResults.length && !searchError ? <p>Nenhum resultado para esta busca.</p> : null}
    </form> : null}
    {searchError ? <p className="inline-error" role="alert">{searchError}</p> : null}

    <dl><div><dt>Estoque atual</dt><dd>{store.currentStock ?? "—"}</dd></div><div><dt>Após entrada</dt><dd>{store.predictedStock ?? "—"}</dd></div><div><dt>Custo atual</dt><dd>{store.currentCost === null ? "—" : formatMoney(store.currentCost)}</dd></div><div><dt>Preço atual</dt><dd>{store.currentSalePrice === null ? "—" : formatMoney(store.currentSalePrice)}</dd></div></dl>
    <label>Quantidade destinada<input className="compact-number" type="number" min="0" step="1" value={store.allocatedQuantity} onChange={(event) => onEdit("allocatedQuantity", numeric(event.target.value))} /></label>
    <div className="price-inputs"><label>Custo novo<input type="number" min="0" step="0.01" value={store.newCost ?? ""} onChange={(event) => onEdit("newCost", numeric(event.target.value))} /></label><label>Preço novo<input type="number" min="0" step="0.01" value={store.newSalePrice ?? ""} onChange={(event) => onEdit("newSalePrice", numeric(event.target.value))} /></label></div>
  </article>;
}

function CandidateList({ candidates, store, selectedProductId, manual = false, onChoose }: {
  candidates: ProductCandidate[];
  store: MultiStoreItemStore;
  selectedProductId: string | null;
  manual?: boolean;
  onChoose: (candidate: ProductCandidate, rank: number) => void;
}) {
  return <div className="candidate-list">{candidates.slice(0, 10).map((candidate, index) => {
    const rank = index + 1;
    const explicitlySelected = candidate.productId === selectedProductId && store.decisionStatus !== "pending";
    return <article className={`candidate-option ${explicitlySelected ? "is-selected" : ""}`} key={candidate.productId}>
      <div className="candidate-option-heading"><div><span>{manual ? "Resultado da busca" : rank === 1 ? "Melhor match" : `Opção ${rank}`}</span><strong>#{candidate.externalId} · {candidate.description}</strong></div><b>{manual || rank > 1 ? "REVISAR" : decisionLabel(store.status)}</b></div>
      <div className="candidate-metrics"><span>Estoque <strong>{candidate.stock ?? "—"}</strong></span><span>Custo <strong>{candidate.costPrice === null ? "—" : formatMoney(candidate.costPrice)}</strong></span><span>Preço <strong>{candidate.salePrice === null ? "—" : formatMoney(candidate.salePrice)}</strong></span><span>Confiança <strong>{formatConfidence(candidate)}</strong></span></div>
      <button className="button button-quiet" type="button" disabled={explicitlySelected} onClick={() => onChoose(candidate, rank)}>{explicitlySelected ? "Produto selecionado" : "Confirmar este produto"}</button>
    </article>;
  })}</div>;
}

async function searchCatalog(store: MultiStoreItemStore, query: string): Promise<ProductCandidate[]> {
  const search = new URLSearchParams({ q: query, storeId: store.storeId, provider: store.provider, limit: "10" });
  const response = await fetch(`/api/erp-products/search?${search.toString()}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { candidates?: ProductCandidate[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Busca indisponível.");
  return Array.isArray(body.candidates) ? body.candidates.slice(0, 10) : [];
}

function createReviewItems(items: MultiStoreItemReview[]): ReviewItem[] {
  const startedAt = Date.now();
  return items.map((item) => ({
    ...item,
    confirmed: false,
    reviewStartedAt: startedAt,
    reviewDurationMs: null,
    telemetry: Object.fromEntries(item.stores.map((store) => [store.storeId, {
      candidateInitiallySelected: store.selectedExternalId,
      initialRankAccepted: null,
      manualSearchUsed: false,
      noMatch: store.status === "NO_CONFIDENT_MATCH" || !store.candidates.length,
      newProduct: false,
    }])),
  }));
}

function selectedStore(store: MultiStoreItemStore, candidate: ProductCandidate | null, status: ReviewItemStatus): MultiStoreItemStore {
  return {
    ...store,
    status: !candidate && status === "new_product" ? "NO_CONFIDENT_MATCH" : candidate && status === "manual_match" ? "REVIEW_REQUIRED" : store.status,
    productId: candidate?.productId ?? null,
    externalId: candidate?.externalId ?? null,
    productDescription: candidate?.description ?? null,
    currentStock: candidate?.stock ?? null,
    currentCost: candidate?.costPrice ?? null,
    currentSalePrice: candidate?.salePrice ?? null,
    predictedStock: candidate?.stock === null || candidate?.stock === undefined ? null : candidate.stock + store.allocatedQuantity,
    selectedProductId: candidate?.productId ?? null,
    selectedExternalId: candidate?.externalId ?? null,
    decisionStatus: status,
    requiresProductCreation: status === "new_product",
  };
}

function toItemTelemetry(item: ReviewItem): ItemReviewTelemetry {
  const cci = item.stores.find((store) => store.provider === "cci");
  if (!cci) throw new Error("Alocação CCI ausente.");
  const cciTelemetry = item.telemetry[cci.storeId];
  const values = Object.values(item.telemetry);
  return {
    candidateInitiallySelected: cciTelemetry.candidateInitiallySelected,
    finalSelectedExternalId: cci.selectedExternalId,
    initialRankAccepted: cciTelemetry.initialRankAccepted,
    manualSearchUsed: values.some((telemetry) => telemetry.manualSearchUsed),
    noMatch: values.some((telemetry) => telemetry.noMatch),
    newProduct: values.some((telemetry) => telemetry.newProduct),
    reviewDurationMs: item.reviewDurationMs ?? Math.max(0, Date.now() - item.reviewStartedAt),
  };
}

function MatchingDebug({ item }: { item: ReviewItem }) {
  return <details className="matching-debug"><summary>MULTI-STORE DEBUG</summary><pre>{JSON.stringify({
    queryOriginal: item.item.description,
    receivedQuantity: item.item.quantity,
    telemetry: item.telemetry,
    stores: item.stores.map((store) => ({
      provider: store.provider,
      storeId: store.storeId,
      normalizedQuery: store.matchingDebug.normalizedQuery,
      parsedIntent: store.matchingDebug.parsedIntent,
      aiCalled: store.matchingDebug.aiCalled,
      decisionTrace: store.matchingDebug.diagnostics,
      currentStock: store.currentStock,
      suggested: store.suggestedQuantity,
      allocated: store.allocatedQuantity,
      predictedStock: store.predictedStock,
      allocationMethod: store.allocationMethod,
      candidates: store.candidates.map((candidate) => ({ externalId: candidate.externalId, description: candidate.description, candidateIntent: candidate.parsedIntent, ...candidate.scoreBreakdown, aiConfidence: candidate.aiConfidence ?? null, finalScore: candidate.finalScore })),
    })),
  }, null, 2)}</pre></details>;
}

function uniqueCandidates(candidates: ProductCandidate[]) {
  return [...new Map(candidates.map((candidate) => [candidate.productId, candidate])).values()];
}
function decisionLabel(status: ProductMatchResult["status"]) {
  return { MATCH_PROBABLE: "MATCH PROVÁVEL", REVIEW_REQUIRED: "REVISAR", NO_CONFIDENT_MATCH: "SEM MATCH" }[status];
}
function formatConfidence(candidate: ProductCandidate) {
  const value = candidate.finalScore ?? candidate.aiConfidence ?? candidate.deterministicScore;
  return Number.isFinite(value) ? `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` : "—";
}
function suggestion(item: ReviewItem): AllocationSuggestion { return { incomingQuantity: item.item.quantity, precision: 0, method: item.allocationMethod, allocations: item.stores as StoreAllocation[], explanation: item.explanation, aiCalled: item.allocationMethod === "ai", fallbackReason: null }; }
function sum(stores: MultiStoreItemStore[]) { return stores.reduce((total, store) => total + store.allocatedQuantity, 0); }
function numeric(value: string) { const parsed = Number(value); return value.trim() && Number.isFinite(parsed) ? parsed : null; }
function formatMoney(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }
function formatNumber(value: number) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value); }
