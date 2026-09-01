import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErpProductRecord } from "@/lib/product-matching/types";

const mocks = vi.hoisted(() => ({
  cachedSearch: vi.fn(),
  accessToken: vi.fn(),
  persist: vi.fn(),
}));

vi.mock("@/lib/product-matching/retrieval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-matching/retrieval")>();
  return {
    ...actual,
    SupabaseProductRetrievalRepository: class {
      search = mocks.cachedSearch;
    },
  };
});
vi.mock("@/lib/tagplus/service", () => ({ getValidTagPlusAccessToken: mocks.accessToken }));
vi.mock("@/lib/tagplus/catalog-persistence", () => ({ persistTagPlusProducts: mocks.persist }));

import { TagPlusProductRetrievalRepository } from "@/lib/tagplus/product-retrieval";

const cachedProduct: ErpProductRecord = {
  productId: "db-6491",
  externalId: "6491",
  description: "MOTOR PARTIDA TITAN 150 - MAGNETRON",
  stock: 1,
  costPrice: 100,
  salePrice: 150,
  barcode: null,
  reference: null,
  supplier: "MAGNETRON",
};

const request = {
  scope: { storeId: "tagplus-store", provider: "tagplus" },
  item: { supplierCode: "6396", supplierReference: null, description: "MOTOR PARTIDA TIT 150", quantity: 1, unitCost: 100, total: 100 },
  intent: { rawDescription: "MOTOR PARTIDA TIT 150", partType: "MOTOR PARTIDA", vehicleModels: ["TITAN"], engineSizes: ["150"], years: [], positions: [], variants: [], brand: null, reference: null, specifications: [] },
  queryText: "MOTOR PARTIDA TIT 150",
  terms: ["MOTOR", "PARTIDA", "TIT", "150"],
  references: [],
  queryEmbedding: null,
  limit: 10,
};

describe("TagPlus live hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cachedSearch.mockResolvedValue([cachedProduct]);
    mocks.accessToken.mockResolvedValue("redacted-token");
    mocks.persist.mockResolvedValue({});
  });

  it("preserves cached candidates and records the hydration error when live lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    const repository = new TagPlusProductRetrievalRepository("user");
    await expect(repository.search(request)).resolves.toEqual([cachedProduct]);
    expect(repository.getLastDiagnostics()).toMatchObject({
      source: "tagplus_live",
      cachedCandidateCount: 1,
      liveAttempted: true,
      liveSucceeded: false,
      hydrationError: "network unavailable",
    });
  });
});
