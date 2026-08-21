import { describe, expect, it } from "vitest";
import { type CreateLocalCatalogProductInput, type LocalCatalogRepository } from "@/lib/catalog/local-product-provider";
import type { CatalogProduct, ProductSearchInput } from "@/lib/catalog/types";
import { confirmIncomingEntry, type IncomingEntryRepository } from "@/lib/incoming-entries/service";
import { createProductReview } from "@/lib/incoming-products/review";

function catalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct { return { id: "catalog-1", userId: "user-1", code: "ANEL-1", name: "Anel Escape", unit: "UN", cost: 4.25, salePrice: 6.38, source: "local", externalId: null, syncStatus: "local_only", createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z", ...overrides }; }

class MemoryRepository implements IncomingEntryRepository, LocalCatalogRepository {
  entries: Array<Record<string, unknown>> = [];
  items: Array<Record<string, unknown>> = [];
  products: CatalogProduct[] = [];
  async search(input: ProductSearchInput) { return this.products.filter((item) => item.userId === input.userId); }
  async findByCode(userId: string, code: string) { return this.products.find((item) => item.userId === userId && item.code === code) ?? null; }
  async create(input: CreateLocalCatalogProductInput) { const created = catalogProduct({ id: `catalog-${this.products.length + 1}`, ...input }); this.products.push(created); return created; }
  async createEntry(input: Record<string, unknown>) { const entry = { id: "entry-1", status: "review" as const, confirmed_at: null, ...input }; this.entries.push(entry); return entry; }
  async createItems(input: Array<Record<string, unknown>>) { this.items.push(...input); return input.map((item, index) => ({ id: `item-${index + 1}`, matched_product_id: String(item.matched_product_id), action: item.action as "matched" | "created" })); }
  async confirmEntry(entryId: string) { return { id: entryId, status: "confirmed" as const, confirmed_at: "2026-08-20T10:00:00Z" }; }
}

function review(overrides: Record<string, unknown> = {}) { return { ...createProductReview({ code: "ANEL-1", description: "Anel Escape", unit: "UN", quantity: 5, unitCost: 4.25 }), profitPercent: 50, rrMotosQuantity: 2, rrAutopecasQuantity: 3, ...overrides }; }

describe("confirmIncomingEntry", () => {
  it("persists a confirmed entry, all reviewed items, and a new local product", async () => {
    const repository = new MemoryRepository();
    const result = await confirmIncomingEntry({ userId: "user-1", sourceFilename: "nota.xml", source: "xml", products: [review()] }, repository);
    expect(result.status).toBe("confirmed");
    expect(result.items[0]).toMatchObject({ action: "created", product: { salePrice: 6.38 } });
    expect(repository.entries).toHaveLength(1);
    expect(repository.items[0]).toMatchObject({ quantity: 5, rr_motos_quantity: 2, rr_autopecas_quantity: 3, action: "created" });
    expect(repository.products).toHaveLength(1);
  });

  it("links a matching exact-code product instead of creating another one", async () => {
    const repository = new MemoryRepository(); repository.products.push(catalogProduct());
    const result = await confirmIncomingEntry({ userId: "user-1", sourceFilename: "nota.pdf", source: "pdf", products: [review()] }, repository);
    expect(result.items[0].action).toBe("matched");
    expect(repository.products).toHaveLength(1);
  });

  it("rejects an invalid store distribution before persistence", async () => {
    const repository = new MemoryRepository();
    await expect(confirmIncomingEntry({ userId: "user-1", sourceFilename: "nota.xml", source: "xml", products: [review({ rrAutopecasQuantity: 2 })] }, repository)).rejects.toThrow("Revise lucro, preço e distribuição");
    expect(repository.entries).toHaveLength(0);
  });
});
