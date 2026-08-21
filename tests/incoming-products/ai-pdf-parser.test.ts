import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePdfWithOpenAI } from "@/lib/incoming-products/ai-pdf-parser";

describe("PDF AI/OCR fallback", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENAI_API_KEY; });

  it("normalizes a strict structured response without making a real request", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ products: [{ code: null, description: "Produto lido", unit: null, quantity: 2, unitCost: 10.5 }] }) }] }] }), { status: 200 })));
    await expect(parsePdfWithOpenAI(Buffer.from("pdf"), "nota.pdf")).resolves.toEqual([{ code: null, description: "Produto lido", unit: null, quantity: 2, unitCost: 10.5 }]);
  });

  it("requires explicit server configuration before sending a PDF", async () => {
    await expect(parsePdfWithOpenAI(Buffer.from("pdf"), "nota.pdf")).rejects.toThrow("OPENAI_API_KEY");
  });
});
