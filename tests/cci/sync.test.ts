import { describe, expect, it } from "vitest";
import { assertReadOnlySelect, CCI_PRODUCTS_QUERY } from "@/connectors/cci/src/firebird";
import { chunkProducts } from "@/connectors/cci/src/sync";
import type { ExternalProduct } from "@/lib/cci/types";
import { syncCciProducts, type CciCredential, type CciSyncRepository } from "@/lib/cci/sync-service";

const storeId = "94eae257-6fb1-4caf-822c-f88f872a7148";
const product: ExternalProduct = {
  externalId: "4337",
  description: "Pedaleira",
  salePrice: 11.5,
  costPrice: 6.98,
  stock: 6,
  barcode: null,
  reference: null,
  location: null,
  supplier: null,
};

class MemoryRepository implements CciSyncRepository {
  readonly rows = new Map<string, ExternalProduct>();
  markedCredential: string | null = null;

  constructor(private readonly credential: CciCredential | null) {}

  async findActiveCredential() { return this.credential; }
  async upsertProducts(targetStoreId: string, products: ExternalProduct[]) {
    products.forEach((item) => this.rows.set(`${targetStoreId}:cci:${item.externalId}`, item));
    return products.length;
  }
  async markCredentialUsed(credentialId: string) { this.markedCredential = credentialId; }
}

describe("CCI sync", () => {
  it("creates predictable chunks", () => {
    expect(chunkProducts([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("keeps the Firebird query read-only", () => {
    expect(() => assertReadOnlySelect(CCI_PRODUCTS_QUERY)).not.toThrow();
    expect(() => assertReadOnlySelect("UPDATE CADASTRODESCRICAO SET PRECO = 1")).toThrow(/somente SELECT/i);
    expect(() => assertReadOnlySelect("SELECT * FROM X; DELETE FROM X")).toThrow(/escrita/i);
  });

  it("rejects a credential bound to another store", async () => {
    const repository = new MemoryRepository({ id: "credential-1", storeId: "e05f0af5-4a55-4d0c-8384-2d3b8c45185d" });
    await expect(syncCciProducts("secret", { storeId, products: [product] }, repository))
      .rejects.toMatchObject({ status: 403 });
    expect(repository.rows.size).toBe(0);
  });

  it("upserts idempotently instead of duplicating a product", async () => {
    const repository = new MemoryRepository({ id: "credential-1", storeId });
    await syncCciProducts("secret", { storeId, products: [product] }, repository);
    await syncCciProducts("secret", { storeId, products: [{ ...product, stock: 9 }] }, repository);
    expect(repository.rows.size).toBe(1);
    expect(repository.rows.get(`${storeId}:cci:4337`)?.stock).toBe(9);
    expect(repository.markedCredential).toBe("credential-1");
  });
});
