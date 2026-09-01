import { normalizeProductDescription, productTokens } from "@/lib/product-matching/normalize";
import type { ErpProductRecord } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

const POSITION_GROUP = ["DIANT", "TRAS", "DIR", "ESQ"];
const VERSION_GROUP = ["ES", "KS", "ESD", "ESI"];
const DISPLACEMENTS = new Set(["50", "100", "110", "125", "135", "150", "160", "190", "200", "250", "300"]);

function dice(first: string, second: string): number {
  if (first === second) return 1;
  if (first.length < 2 || second.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let index = 0; index < first.length - 1; index += 1) { const pair = first.slice(index, index + 2); pairs.set(pair, (pairs.get(pair) ?? 0) + 1); }
  let count = 0;
  for (let index = 0; index < second.length - 1; index += 1) { const pair = second.slice(index, index + 2); const available = pairs.get(pair) ?? 0; if (available > 0) { count += 1; pairs.set(pair, available - 1); } }
  return (2 * count) / (first.length + second.length - 2);
}

function overlap(first: Set<string>, second: Set<string>) { if (!first.size) return 0; let count = 0; for (const token of first) if (second.has(token)) count += 1; return count / first.size; }
function contradiction(query: Set<string>, candidate: Set<string>, group: string[]) { const queryValue = group.find((value) => query.has(value)); const candidateValue = group.find((value) => candidate.has(value)); return queryValue && candidateValue && queryValue !== candidateValue ? 1 : 0; }

export function legacyProductScore(item: PurchaseDocumentItem, product: ErpProductRecord) {
  const query = normalizeProductDescription(item.description);
  const description = normalizeProductDescription(product.description);
  const queryTokens = new Set(productTokens(query));
  const candidateTokens = new Set(productTokens(description));
  const supplierRef = normalizeProductDescription(item.supplierReference ?? "");
  const productRef = normalizeProductDescription(product.reference ?? "");
  const barcode = normalizeProductDescription(product.barcode ?? "");
  const exactReference = !!supplierRef && (supplierRef === productRef || supplierRef === barcode);
  let score = dice(query, description) * 0.48 + overlap(queryTokens, candidateTokens) * 0.42;
  if (exactReference) score += 0.45;
  if (product.supplier && queryTokens.has(normalizeProductDescription(product.supplier))) score += 0.05;
  score -= contradiction(queryTokens, candidateTokens, POSITION_GROUP) * 0.34;
  score -= contradiction(queryTokens, candidateTokens, VERSION_GROUP) * 0.28;
  const queryCc = [...queryTokens].find((token) => DISPLACEMENTS.has(token));
  const candidateCc = [...candidateTokens].find((token) => DISPLACEMENTS.has(token));
  if (queryCc && candidateCc && queryCc !== candidateCc) score -= 0.38;
  return Math.max(0, Math.min(1, score));
}
