import { describe, expect, it } from "vitest";
import { LocalProductProvider, type CreateLocalCatalogProductInput, type LocalCatalogRepository } from "@/lib/catalog/local-product-provider";
import { createProductProvider, getProductProviderKind } from "@/lib/catalog/provider";
import type { CatalogProduct, ProductSearchInput } from "@/lib/catalog/types";

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return { id: "catalog-1", userId: "user-1", code: "ANEL-1", name: "Anel Escape", unit: "UN", cost: 4.25, salePrice: 6.38, source: "local", externalId: null, syncStatus: "local_only", createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z", ...overrides };
}

class MemoryCatalogRepository implements LocalCatalogRepository {
  constructor(private products: CatalogProduct[]) {}
  async search(input: ProductSearchInput) { const query = (input.code ?? input.query ?? "").toLowerCase(); return this.products.filter((item) => item.userId === input.userId && (!query || item.code?.toLowerCase().includes(query) || item.name.toLowerCase().includes(query))); }
  async findByCode(userId: string, code: string) { return this.products.find((item) => item.userId === userId && item.code === code) ?? null; }
  async create(input: CreateLocalCatalogProductInput) { const created = product({ id: `catalog-${this.products.length + 1}`, ...input, name: input.name, source: "local" }); this.products.push(created); return created; }
}

describe("LocalProductProvider", () => {
  it("searches by exact code and does not expose other users' catalog", async () => {
    const provider = new LocalProductProvider(new MemoryCatalogRepository([product(), product({ id: "catalog-2", userId: "user-2", code: "ANEL-1" })]));
    await expect(provider.searchProducts({ userId: "user-1", code: "ANEL-1" })).resolves.toMatchObject([{ id: "catalog-1", name: "Anel Escape" }]);
  });

  it("returns null when the product does not exist", async () => {
    const provider = new LocalProductProvider(new MemoryCatalogRepository([]));
    await expect(provider.getProductByCode("user-1", "MISSING")).resolves.toBeNull();
  });

  it("selects local mode by default without constructing a TagPlus request", () => {
    expect(getProductProviderKind()).toBe("local");
    expect(createProductProvider("local")).toBeInstanceOf(LocalProductProvider);
    expect(getProductProviderKind("tagplus")).toBe("tagplus");
  });
});
