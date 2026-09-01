import { describe, expect, it } from "vitest";
import { normalizeProductDescription } from "@/lib/product-matching/normalize";
import { parseProductIntent } from "@/lib/product-matching/intent";
import { evaluateProductCompatibility } from "@/lib/product-matching/compatibility";

describe("Semantic Aliases", () => {
  describe("PART → PARTIDA", () => {
    it("expande PART para PARTIDA", () => {
      const result = normalizeProductDescription("MOTOR PART TIT 150");
      expect(result).toBe("MOTOR PARTIDA TIT 150");
    });

    it("não expande PART TYPE (preserva contextos especiais)", () => {
      const result = normalizeProductDescription("PART TYPE ANALYSIS");
      expect(result).toBe("PART TYPE ANALYSIS");
    });

    it("melhora matching entre MOTOR PART e MOTOR PARTIDA", () => {
      const queryIntent = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "MOTOR PART TIT 150 04/14 MAGN",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const candidateIntent = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "MOTOR PARTIDA TITAN 150/FAN 150 - MAGNETRON",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const compat = evaluateProductCompatibility(queryIntent, candidateIntent);

      // Deve reconhecer como mesmo tipo de peça
      expect(compat.partTypeCompatibility).not.toBe("CONFLICT");
      expect(compat.queryPartTypeCanonical).toContain("PARTIDA");
    });
  });

  describe("PATIN ↔ PATIM", () => {
    it("normaliza PATIN para PATIM", () => {
      const result = normalizeProductDescription("EIXO ABRE PATIN FREIO");
      expect(result).toBe("EIXO ABRE PATIM FREIO");
    });

    it("preserva PATIM como PATIM", () => {
      const result = normalizeProductDescription("EIXO ABRE PATIM FREIO");
      expect(result).toBe("EIXO ABRE PATIM FREIO");
    });

    it("permite matching bidirecional PATIN/PATIM", () => {
      const queryWithPatin = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "EIXO ABRE PATIN TIT 150",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const candidateWithPatim = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "EIXO ABRE PATIM TITAN 150 09/15",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const compat = evaluateProductCompatibility(queryWithPatin, candidateWithPatim);

      // Deve reconhecer como mesmo tipo de peça
      expect(compat.partTypeCompatibility).not.toBe("CONFLICT");
    });
  });

  describe("GUIA CORR → GUIA CORRENTE", () => {
    it("expande GUIA CORR para GUIA CORRENTE", () => {
      const result = normalizeProductDescription("GUIA CORR TRACAO TIT 150");
      expect(result).toBe("GUIA CORRENTE TRACAO TIT 150");
    });

    it("preserva GUIA CORRENTE existente", () => {
      const result = normalizeProductDescription("GUIA CORRENTE TRACAO TIT 150");
      expect(result).toBe("GUIA CORRENTE TRACAO TIT 150");
    });

    it("melhora matching entre GUIA CORR e GUIA CORRENTE", () => {
      const queryAbbreviated = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "GUIA CORR TRACAO TIT 150",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const candidateFull = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "GUIA CORRENTE TRACAO TITAN 150 04/08",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const compat = evaluateProductCompatibility(queryAbbreviated, candidateFull);

      // Deve reconhecer como mesmo tipo de peça
      expect(compat.partTypeCompatibility).not.toBe("CONFLICT");
      expect(compat.queryPartTypeCanonical).toContain("CORRENTE");
    });
  });

  describe("ESCAP → ESCAPE", () => {
    it("expande ESCAP para ESCAPE", () => {
      const result = normalizeProductDescription("PROTETOR ESCAP TIT 150");
      expect(result).toBe("PROTETOR ESCAPE TIT 150");
    });

    it("preserva ESCAPE existente", () => {
      const result = normalizeProductDescription("PROTETOR ESCAPE TIT 150");
      expect(result).toBe("PROTETOR ESCAPE TIT 150");
    });

    it("preserva ESCAPAMENTO existente", () => {
      const result = normalizeProductDescription("PROTETOR ESCAPAMENTO TIT 150");
      expect(result).toBe("PROTETOR ESCAPAMENTO TIT 150");
    });

    it("melhora matching entre ESCAP e ESCAPE", () => {
      const queryAbbreviated = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "PROTETOR ESCAP TIT 150 04/08",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const candidateExpanded = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "PROTETOR ESCAPAMENTO TITAN 150 04/08",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const compat = evaluateProductCompatibility(queryAbbreviated, candidateExpanded);

      // Deve reconhecer como mesmo tipo de peça
      expect(compat.partTypeCompatibility).not.toBe("CONFLICT");
    });
  });

  describe("Aliases não alteram comportamento existente", () => {
    it("não interfere com matching de MOTOR PARTIDA já funcional", () => {
      const query = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "MOTOR PARTIDA TIT 150 04/14 MAGN",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const candidate = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "MOTOR PARTIDA TITAN 150/FAN 150 - MAGNETRON",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const compat = evaluateProductCompatibility(query, candidate);

      expect(compat.partTypeCompatibility).toBe("COMPATIBLE");
      expect(compat.queryPartTypeCanonical).toBe("MOTOR PARTIDA");
      expect(compat.candidatePartTypeCanonical).toBe("MOTOR PARTIDA");
    });

    it("não cria conflitos falsos em peças diferentes", () => {
      const query = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "MOTOR PART TIT 150",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const differentPart = parseProductIntent({
        supplierCode: null,
        supplierReference: null,
        description: "CHAVE LUZ TITAN 150 ES",
        quantity: 1,
        unitCost: 1,
        total: 1,
      });

      const compat = evaluateProductCompatibility(query, differentPart);

      // Peças diferentes devem continuar sendo reconhecidas como diferentes
      expect(compat.partTypeCompatibility).not.toBe("COMPATIBLE");
    });
  });

  describe("Combinação de múltiplos aliases", () => {
    it("aplica múltiplos aliases na mesma descrição", () => {
      const result = normalizeProductDescription("EIXO ABRE PATIN + GUIA CORR + PROTETOR ESCAP");
      expect(result).toBe("EIXO ABRE PATIM GUIA CORRENTE PROTETOR ESCAPE");
    });

    it("aliases são idempotentes (rodar duas vezes não muda resultado)", () => {
      const once = normalizeProductDescription("MOTOR PART PATIN ESCAP");
      const twice = normalizeProductDescription(once);
      expect(once).toBe(twice);
      expect(once).toBe("MOTOR PARTIDA PATIM ESCAPE");
    });
  });
});
