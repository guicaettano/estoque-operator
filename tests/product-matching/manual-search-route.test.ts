import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getOperationalStores: vi.fn(),
  retrieveProductCandidates: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/stores/operational-stores", () => ({ getOperationalStores: mocks.getOperationalStores }));
vi.mock("@/lib/product-matching/retrieval", () => ({ retrieveProductCandidates: mocks.retrieveProductCandidates }));

import { GET } from "@/app/api/erp-products/search/route";

describe("manual catalog search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mocks.getOperationalStores.mockResolvedValue([
      { id: "cci-store", name: "Loja CCI", provider: "cci" },
      { id: "tag-store", name: "Loja TagPlus", provider: "tagplus" },
    ]);
    mocks.retrieveProductCandidates.mockResolvedValue([]);
  });

  it("isolates the search by the authenticated user's store and provider", async () => {
    const response = await GET(new NextRequest("http://localhost/api/erp-products/search?q=motor+partida&storeId=tag-store&provider=tagplus&limit=30"));
    expect(response.status).toBe(200);
    expect(mocks.retrieveProductCandidates).toHaveBeenCalledWith(expect.objectContaining({ storeId: "tag-store", provider: "tagplus", limit: 10 }));
  });

  it("rejects a store/provider pair outside the user's operational stores", async () => {
    const response = await GET(new NextRequest("http://localhost/api/erp-products/search?q=motor&storeId=tag-store&provider=cci"));
    expect(response.status).toBe(403);
    expect(mocks.retrieveProductCandidates).not.toHaveBeenCalled();
  });
});
