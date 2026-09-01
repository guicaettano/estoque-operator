import { normalizeProductDescription } from "@/lib/product-matching/normalize";
import type { ParsedProductIntent, PartTypeCompatibility, ProductCompatibility } from "@/lib/product-matching/types";

type PartRule = { canonical: string; family: string; aliases: string[] };

const PART_RULES: PartRule[] = [
  { canonical: "COXIM COROA TRANSMISSAO", family: "TRANSMISSAO", aliases: ["COXIM COROA TRANSMISSAO", "COXIM COROA", "BORR COROA"] },
  { canonical: "COXIM ESCAPAMENTO", family: "ESCAPE", aliases: ["COXIM ESCAPAMENTO", "COXIM ESCAP"] },
  { canonical: "COXIM MOTOR", family: "MOTOR", aliases: ["COXIM MOTOR"] },
  { canonical: "RETENTOR EMBREAGEM", family: "VEDACAO", aliases: ["RETENTOR EMBREAGEM", "RETENTOR EMBR"] },
  { canonical: "INTERRUPTOR EMBREAGEM", family: "ELETRICA", aliases: ["INTERRUPTOR EMBREAGEM", "INTERRUPTOR MOTO FREIO EMBREAGEM"] },
  { canonical: "DISCO EMBREAGEM", family: "EMBREAGEM", aliases: ["DISCO EMBREAGEM"] },
  { canonical: "FILTRO COMBUSTIVEL", family: "COMBUSTIVEL", aliases: ["FILTRO MOTO COMBUSTIVEL", "FILTRO COMBUSTIVEL"] },
  { canonical: "BOMBA COMBUSTIVEL", family: "COMBUSTIVEL", aliases: ["BOMBA COMBUSTIVEL"] },
  { canonical: "PATIM FREIO", family: "FREIO", aliases: ["PATIM FREIO", "LONA FREIO"] },
  { canonical: "AMORTECEDOR", family: "SUSPENSAO", aliases: ["AMORTECEDOR"] },
  { canonical: "ROLAMENTO", family: "ROLAMENTO", aliases: ["ROLAMENTO"] },
  { canonical: "RETENTOR", family: "VEDACAO", aliases: ["RETENTOR"] },
  { canonical: "TAMPA MOTOR PARTIDA", family: "MOTOR PARTIDA", aliases: ["TAMPA MOTOR PARTIDA"] },
  { canonical: "ANEL TAMPA PARTIDA", family: "TAMPA PARTIDA", aliases: ["ANEL TAMPA PARTIDA", "ANEL MOTO TPA PARTIDA"] },
  { canonical: "INTERRUPTOR FREIO", family: "FREIO", aliases: ["INTERRUPTOR FREIO", "INTERRUPTOR MOTO FREIO"] },
  { canonical: "REPARO PINCA FREIO", family: "FREIO", aliases: ["REPARO FREIO PINCA", "REPARO PINCA", "BORRACHA REPARO FREIO"] },
  { canonical: "REPARO PINCA FREIO", family: "FREIO", aliases: ["REPARO MOTO FREIO DISCO", "REPARO FREIO DISCO"] },
  { canonical: "INTERRUPTOR PARTIDA", family: "PARTIDA", aliases: ["INTERRUPTOR MOTO PARTIDA", "INTERRUPTOR PARTIDA", "INTERRUPTOR PART"] },
  { canonical: "INTERRUPTOR EMERGENCIA", family: "ELETRICA", aliases: ["INTERRUPTOR MOTO EMERGENCIA", "INTERRUPTOR EMERGENCIA"] },
  { canonical: "EIXO ABRE PATIM", family: "FREIO", aliases: ["EIXO ABRE PATIM", "EIXO ABRI PATIM", "EIXO ABRE PATIN", "EIXO ABRI PATIN"] },
  { canonical: "FLEXIVEL FREIO", family: "FREIO", aliases: ["FLEXIVEL FREIO"] },
  { canonical: "DISCO FREIO", family: "FREIO", aliases: ["DISCO MOTO FREIO", "DISCO FREIO"] },
  { canonical: "CABO VELOCIMETRO", family: "CABO", aliases: ["CABO MOTO VELOCIMETRO", "CABO VELOCIMETRO", "CABO VELOC"] },
  { canonical: "CABO EMBREAGEM", family: "CABO", aliases: ["CABO MOTO EMBREAGEM", "CABO EMBREAGEM", "CABO EMB"] },
  { canonical: "CANELA BENGALA", family: "SUSPENSAO", aliases: ["CILINDRO EXTERNO BENGALA", "CILINDRO EXT BENGALA", "CANELA BENGALA", "CANELA"] },
  { canonical: "TUBO INTERNO BENGALA", family: "SUSPENSAO", aliases: ["TUBO INT INFERIOR BENGALA", "TUBO INTERNO BANGALA", "TUBO INTERNO BENGALA", "TUBO BENGALA"] },
  { canonical: "PEDALEIRA", family: "PEDALEIRA", aliases: ["PEDALEIRA"] },
  { canonical: "KIT VEDACAO MOTOR PARTIDA", family: "VEDACAO", aliases: ["KIT VEDACAO MOTOR PARTIDA"] },
  { canonical: "MOTOR PARTIDA", family: "MOTOR PARTIDA", aliases: ["MOTOR PARTIDA", "MOTOR PART"] },
  { canonical: "CHAVE LUZ", family: "COMANDO ELETRICO", aliases: ["CHAVE LUZ"] },
  { canonical: "CORRENTE COMANDO", family: "MOTOR", aliases: ["CORRENTE COMANDO", "CORR COMANDO"] },
  { canonical: "VARETA FREIO", family: "FREIO", aliases: ["VARETA FREIO"] },
  { canonical: "MANICOTO EMBREAGEM", family: "EMBREAGEM", aliases: ["MANICOTO EMBREAGEM", "MANICOTO EMBR"] },
  { canonical: "CHICOTE PAINEL", family: "ELETRICA", aliases: ["FIACAO PAINEL", "CHICOTE PAINEL", "CHICOTE MOTO PAINEL"] },
  { canonical: "PROTETOR ESCAPAMENTO", family: "ESCAPE", aliases: ["PROTECAO ESCAPAMENTO", "PROTETOR ESCAPAMENTO", "PROTETOR ESCAPE"] },
  { canonical: "PROTETOR DIANTEIRO", family: "PROTECAO", aliases: ["PROTETOR DIANT", "PROTETOR DIANTEIRO", "MATA CACHORRO", "MATA CAO", "MATA C"] },
  { canonical: "BAGAGEIRO", family: "BAGAGEIRO", aliases: ["BAGAGEIRO"] },
  { canonical: "CARCACA PAINEL", family: "PAINEL", aliases: ["CARCACA SUP PAINEL", "CARCACA PAINEL"] },
  { canonical: "ANEL ESCAPE", family: "ESCAPE", aliases: ["ANEL MOTO ESCAP", "ANEL ESCAP", "ANEL ESCAPE"] },
  { canonical: "ESCAPAMENTO", family: "ESCAPE", aliases: ["ESCAPAMENTO", "ESCAPE", "ESCAP"] },
  { canonical: "CAMARA AR", family: "PNEU", aliases: ["CAMARA AR"] },
  { canonical: "GUIA CORRENTE TRACAO", family: "TRANSMISSAO", aliases: ["GUIA CORRENTE TRANS", "GUIA CORRENTE TRACAO", "GUIA CORR TRACAO"] },
  { canonical: "PASTILHA FREIO", family: "FREIO", aliases: ["PASTILHA FREIO", "PASTILHA"] },
  { canonical: "LONA FREIO", family: "FREIO", aliases: ["LONA FREIO"] },
];

const CANONICAL_ALIASES: Record<string, string> = {
  "ACIONAMENTO EMBREAGEM": "MANICOTO EMBREAGEM",
  "FIACAO PAINEL": "CHICOTE PAINEL",
  "REPARO FREIO PINCA": "REPARO PINCA FREIO",
  "PROTETOR DIANT": "PROTETOR DIANTEIRO",
  "CILINDRO EXTERNO BENGALA": "CANELA BENGALA",
  "CILINDRO EXT BENGALA": "CANELA BENGALA",
  "TUBO INTERNO BANGALA": "TUBO INTERNO BENGALA",
  "PROTECAO ESCAPAMENTO": "PROTETOR ESCAPAMENTO",
  "PROTETOR ESCAPE": "PROTETOR ESCAPAMENTO",
  "LONA FREIO": "PATIM FREIO",
  "GUIA CORRENTE TRANS": "GUIA CORRENTE TRACAO",
  // ESCAP removed: now handled by semantic aliases in normalize.ts
  ESCAPE: "ESCAPAMENTO",
};

const EXPLICIT_CONFLICTS = new Set([
  conflictKey("FILTRO COMBUSTIVEL", "BOMBA COMBUSTIVEL"),
  conflictKey("PATIM FREIO", "EIXO ABRE PATIM"),
  conflictKey("RETENTOR EMBREAGEM", "INTERRUPTOR EMBREAGEM"),
  conflictKey("RETENTOR EMBREAGEM", "CABO EMBREAGEM"),
  conflictKey("RETENTOR EMBREAGEM", "MANICOTO EMBREAGEM"),
  conflictKey("RETENTOR EMBREAGEM", "DISCO EMBREAGEM"),
  conflictKey("COXIM COROA TRANSMISSAO", "COXIM ESCAPAMENTO"),
  conflictKey("COXIM COROA TRANSMISSAO", "COXIM MOTOR"),
  conflictKey("MOTOR PARTIDA", "TAMPA MOTOR PARTIDA"),
  conflictKey("MOTOR PARTIDA", "KIT VEDACAO MOTOR PARTIDA"),
  conflictKey("DISCO FREIO", "INTERRUPTOR FREIO"),
  conflictKey("CORRENTE COMANDO", "VARETA FREIO"),
  conflictKey("CANELA BENGALA", "PEDALEIRA"),
  conflictKey("REPARO PINCA FREIO", "FLEXIVEL FREIO"),
  conflictKey("CHAVE LUZ", "ANEL TAMPA PARTIDA"),
  conflictKey("CABO VELOCIMETRO", "CABO EMBREAGEM"),
  conflictKey("INTERRUPTOR PARTIDA", "INTERRUPTOR FREIO"),
  conflictKey("INTERRUPTOR PARTIDA", "INTERRUPTOR EMERGENCIA"),
  conflictKey("PROTETOR DIANTEIRO", "PROTETOR ESCAPAMENTO"),
]);

function containsPhrase(text: string, phrase: string) {
  return (` ${text.replaceAll("/", " ")} `).includes(` ${phrase.replaceAll("/", " ")} `);
}

function conflictKey(first: string, second: string) {
  return [first, second].sort().join("::");
}

export function canonicalizePartType(partType: string | null): string | null {
  if (!partType) return null;
  const normalized = normalizeProductDescription(partType);
  const direct = CANONICAL_ALIASES[normalized];
  if (direct) return direct;
  const contextual = normalized.split(" ").map((token) => ({
    EMBR: "EMBREAGEM",
    BANGALA: "BENGALA",
    PART: "PARTIDA",
    DIANT: "DIANTEIRO",
    TRAS: "TRASEIRO",
    TIT: "TITAN",
  })[token] ?? token).join(" ");
  return CANONICAL_ALIASES[contextual] ?? contextual;
}

export function inferPartIdentity(description: string) {
  const normalized = normalizeProductDescription(description);
  for (const rule of PART_RULES) {
    const rawPartType = rule.aliases.find((alias) => containsPhrase(normalized, alias));
    if (rawPartType) return { rawPartType, partType: rule.canonical, partFamily: rule.family, confidence: 1 };
  }
  return { rawPartType: null, partType: null, partFamily: null, confidence: 0 };
}

function explicitCompatibility(query: string[], candidate: string[]): boolean | null {
  if (!query.length || !candidate.length) return null;
  return query.some((value) => candidate.includes(value));
}

function brandCompatibility(query: string | null, candidate: string | null): boolean | null {
  if (!query || !candidate) return null;
  return query === candidate;
}

function classifyPartType(query: string | null, candidate: string | null): { compatibility: PartTypeCompatibility; reason: string } {
  if (!query || !candidate) return { compatibility: "UNKNOWN", reason: "part_type_missing_or_unrecognized" };
  if (query === candidate) return { compatibility: "COMPATIBLE", reason: "canonical_part_type_match" };
  if (EXPLICIT_CONFLICTS.has(conflictKey(query, candidate))) {
    return { compatibility: "CONFLICT", reason: `explicit_part_type_conflict: ${query} != ${candidate}` };
  }
  return { compatibility: "UNKNOWN", reason: "different_types_without_explicit_conflict" };
}

export function evaluateProductCompatibility(queryIntent: ParsedProductIntent, candidateIntent: ParsedProductIntent): ProductCompatibility {
  const inferredQuery = inferPartIdentity(queryIntent.rawDescription);
  const inferredCandidate = inferPartIdentity(candidateIntent.rawDescription);
  const queryPartTypeRaw = queryIntent.partType ?? inferredQuery.rawPartType;
  const candidatePartTypeRaw = candidateIntent.partType ?? inferredCandidate.rawPartType;
  const queryPartTypeCanonical = queryIntent.partType ? canonicalizePartType(queryIntent.partType) : inferredQuery.partType;
  const candidatePartTypeCanonical = candidateIntent.partType ? canonicalizePartType(candidateIntent.partType) : inferredCandidate.partType;
  const partType = classifyPartType(queryPartTypeCanonical, candidatePartTypeCanonical);
  const vehicleCompatible = explicitCompatibility(queryIntent.vehicleModels, candidateIntent.vehicleModels);
  const engineCompatible = explicitCompatibility(queryIntent.engineSizes, candidateIntent.engineSizes);
  const yearCompatible = explicitCompatibility(queryIntent.years, candidateIntent.years);
  const positionCompatible = explicitCompatibility(queryIntent.positions, candidateIntent.positions);
  const variantCompatible = explicitCompatibility(queryIntent.variants, candidateIntent.variants);
  const brandCompatible = brandCompatibility(queryIntent.brand, candidateIntent.brand);
  const domainCompatible = queryIntent.domain && candidateIntent.domain && queryIntent.domain !== "UNKNOWN" && candidateIntent.domain !== "UNKNOWN" ? queryIntent.domain === candidateIntent.domain : null;
  const hardConflicts: string[] = [];
  if (partType.compatibility === "CONFLICT") hardConflicts.push("partType");
  if (partType.compatibility === "COMPATIBLE" && positionCompatible === false) hardConflicts.push("position");
  if (domainCompatible === false) hardConflicts.push("domain");
  return {
    partTypeCompatibility: partType.compatibility,
    queryPartTypeRaw,
    candidatePartTypeRaw,
    queryPartTypeCanonical,
    candidatePartTypeCanonical,
    reason: partType.reason,
    vehicleCompatible,
    engineCompatible,
    yearCompatible,
    positionCompatible,
    variantCompatible,
    brandCompatible,
    domainCompatible,
    hardConflicts,
  };
}

export function withInferredPartType(intent: ParsedProductIntent): ParsedProductIntent {
  const inferred = inferPartIdentity(intent.rawDescription);
  const partType = canonicalizePartType(intent.partType) ?? inferred.partType;
  return partType ? { ...intent, partType } : intent;
}
