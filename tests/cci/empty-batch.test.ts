import { describe, expect, it, vi } from "vitest";
import { syncProductBatches } from "@/connectors/cci/src/sync";

describe("syncProductBatches with an empty catalog", () => {
  it("still calls the backend so the store credential is validated", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      received: 0,
      upserted: 0,
      errors: 0,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(syncProductBatches({
      products: [],
      storeId: "94eae257-6fb1-4caf-822c-f88f872a7148",
      syncUrl: "https://example.com/api/integrations/cci/sync",
      connectorToken: "secret",
      batchSize: 500,
      requestTimeoutMs: 1_000,
      fetcher,
    })).resolves.toMatchObject({ received: 0, upserted: 0, errors: 0 });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
      storeId: "94eae257-6fb1-4caf-822c-f88f872a7148",
      products: [],
    }));
  });
});
