/**
 * Semantic aliases for common abbreviations and variations.
 * Applied after normalization but before tokenization to improve matching.
 * These are domain-general patterns, not SKU-specific mappings.
 */
const SEMANTIC_ALIASES: Array<[RegExp, string]> = [
  // Catalog synonym: "mata-cachorro" is the same part type as front protector.
  [/\bMATA\s+(?:C|CACHORRO|CAO)\b/g, "PROTETOR DIANTEIRO"],

  // PART → PARTIDA (when not followed by TYPE to avoid "PART TYPE" → "PARTIDA TYPE")
  [/\bPART\b(?!\s*TYPE)/g, "PARTIDA"],
  
  // PATIN ↔ PATIM (bidirectional normalization to PATIM)
  [/\bPATIN\b/g, "PATIM"],
  
  // GUIA CORR → GUIA CORRENTE (expand abbreviated "corrente")
  [/\bGUIA\s+CORR\b/g, "GUIA CORRENTE"],
  
  // ESCAP → ESCAPE (normalize to full form)
  [/\bESCAP\b/g, "ESCAPE"],
];

/**
 * Apply semantic aliases to normalized text.
 * Should be called after basic normalization but before intent parsing.
 */
function applySemanticAliases(normalized: string): string {
  let result = normalized;
  for (const [pattern, replacement] of SEMANTIC_ALIASES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function normalizeProductDescription(text: string): string {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/([0-9])\s*\/\s*([0-9])/g, "$1/$2")
    .replace(/[^A-Z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  return applySemanticAliases(normalized);
}

export function productTokens(text: string): string[] {
  return [...new Set(normalizeProductDescription(text).split(" ").filter(Boolean))];
}
