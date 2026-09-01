import { MATCHING_CONFIG } from "@/lib/product-matching/config";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { normalizeProductDescription, productTokens } from "@/lib/product-matching/normalize";
import { evaluateProductReferenceMatch } from "@/lib/product-matching/reference";
import type { ErpProductRecord, ParsedProductIntent, ProductCandidate } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

function dice(first: string, second: string): number {
  if (first === second) return 1;
  if (first.length < 2 || second.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let index = 0; index < first.length - 1; index += 1) {
    const pair = first.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < second.length - 1; index += 1) {
    const pair = second.slice(index, index + 2);
    const available = pairs.get(pair) ?? 0;
    if (available > 0) { overlap += 1; pairs.set(pair, available - 1); }
  }
  return (2 * overlap) / (first.length + second.length - 2);
}

function tokenOverlap(first: string[], second: string[]): number {
  const query = new Set(first.flatMap((value) => productTokens(value)));
  const candidate = new Set(second.flatMap((value) => productTokens(value)));
  if (!query.size) return 0;
  let count = 0;
  for (const token of query) if (candidate.has(token)) count += 1;
  return count / query.size;
}

function signal(query: string[], candidate: string[]) {
  if (!query.length || !candidate.length) return { score: 0, conflict: false };
  const score = tokenOverlap(query, candidate);
  return { score, conflict: score === 0 };
}

function candidateIntent(product: ErpProductRecord) {
  return parseProductIntent({
    supplierCode: null,
    supplierReference: product.reference,
    description: [product.description, product.supplier].filter(Boolean).join(" "),
    quantity: 1,
    unitCost: 0,
    total: null,
  });
}

export function scoreProductCandidate(item: PurchaseDocumentItem, product: ErpProductRecord, options: { intent?: ParsedProductIntent } = {}): ProductCandidate {
  const intent = options.intent ?? parseProductIntent(item);
  const parsedCandidate = candidateIntent(product);
  const query = normalizeProductDescription(item.description);
  const description = normalizeProductDescription(product.description);
  const localLexical = (dice(query, description) * 0.55) + (tokenOverlap([query], [description]) * 0.45);
  const lexicalScore = Math.max(localLexical, product.retrievalLexicalScore ?? 0);
  const semanticScore = product.retrievalSemanticScore ?? null;
  const referenceMatch = evaluateProductReferenceMatch(item, product);
  const exactReference = referenceMatch.exact;

  const partTypeConflict = !!intent.partType && !!parsedCandidate.partType && intent.partType !== parsedCandidate.partType;
  const partTypeScore = intent.partType && parsedCandidate.partType && intent.partType === parsedCandidate.partType ? 1 : 0;
  const vehicle = signal(intent.vehicleModels, parsedCandidate.vehicleModels);
  const engine = signal(intent.engineSizes, parsedCandidate.engineSizes);
  const year = signal(intent.years, parsedCandidate.years);
  const position = signal(intent.positions, parsedCandidate.positions);
  const variant = signal(intent.variants, parsedCandidate.variants);
  const brand = signal(intent.brand ? [intent.brand] : [], parsedCandidate.brand ? [parsedCandidate.brand] : []);
  const specification = signal(intent.specifications, parsedCandidate.specifications);
  const conflicts: string[] = [];
  let conflictPenalty = 0;
  const addConflict = (conflict: boolean, label: string, penalty: number) => { if (conflict) { conflicts.push(label); conflictPenalty += penalty; } };
  addConflict(partTypeConflict, "partType", MATCHING_CONFIG.conflicts.partType);
  addConflict(vehicle.conflict, "vehicle", MATCHING_CONFIG.conflicts.vehicle);
  addConflict(engine.conflict, "engineSize", MATCHING_CONFIG.conflicts.engineSize);
  addConflict(year.conflict, "year", MATCHING_CONFIG.conflicts.year);
  addConflict(position.conflict, "position", MATCHING_CONFIG.conflicts.position);
  addConflict(variant.conflict, "variant", MATCHING_CONFIG.conflicts.variant);
  addConflict(brand.conflict, "brand", MATCHING_CONFIG.conflicts.brand);
  addConflict(specification.conflict, "specification", MATCHING_CONFIG.conflicts.specification);

  const weights = MATCHING_CONFIG.weights;
  const positive =
    (exactReference ? weights.exactReference : 0) +
    lexicalScore * weights.lexical +
    (semanticScore ?? 0) * weights.semantic +
    partTypeScore * weights.partType +
    vehicle.score * weights.vehicle +
    engine.score * weights.engineSize +
    year.score * weights.year +
    position.score * weights.position +
    variant.score * weights.variant +
    brand.score * weights.brand +
    specification.score * weights.specification;
  let retrievalScore = Math.max(0, Math.min(1, positive - conflictPenalty));
  if (partTypeConflict) retrievalScore = Math.min(retrievalScore, MATCHING_CONFIG.conflicts.partTypeScoreCap);
  if (exactReference) retrievalScore = Math.max(retrievalScore, MATCHING_CONFIG.exactReferenceScore);

  return {
    ...product,
    deterministicScore: retrievalScore,
    finalScore: retrievalScore,
    parsedIntent: parsedCandidate,
    scoreBreakdown: {
      exactReferenceBonus: exactReference ? weights.exactReference : 0,
      exactReferenceMatch: referenceMatch.exact,
      nearReferenceMatch: referenceMatch.near,
      referenceMatchSource: referenceMatch.source,
      normalizedSupplierCode: referenceMatch.normalizedSupplierCode,
      lexicalScore,
      semanticScore,
      partTypeScore,
      vehicleScore: vehicle.score,
      engineSizeScore: engine.score,
      yearScore: year.score,
      positionScore: position.score,
      variantScore: variant.score,
      brandScore: brand.score,
      specificationScore: specification.score,
      conflictPenalty,
      partTypeConflict,
      conflicts,
      retrievalScore,
    },
  };
}
