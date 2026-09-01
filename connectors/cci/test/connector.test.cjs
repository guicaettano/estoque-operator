const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeCciProduct } = require("../dist/normalize.js");
const { assertReadOnlySelect, CCI_PRODUCTS_QUERY } = require("../dist/firebird.js");
const { chunkProducts, syncProductBatches } = require("../dist/sync.js");

test("normalizes a CCI row and preserves null values", () => {
  const product = normalizeCciProduct({
    CODIGO: 4337,
    DESCRICAO: "PEDALEIRA TRAS CG/TOD/TITAN - VALCLA",
    PRECO: "11.50",
    PRECOCOMPRA: 6.98,
    ESTOQUE: "6.000",
    CODIGOBARRAS: null,
    REFERENCIA: null,
    LOCALIZACAO: null,
    FORNECEDOR: null,
  });

  assert.equal(product.externalId, "4337");
  assert.equal(product.salePrice, 11.5);
  assert.equal(product.costPrice, 6.98);
  assert.equal(product.stock, 6);
  assert.equal(product.barcode, null);
  assert.equal(product.reference, null);
});

test("chunks batches and rejects Firebird write commands", () => {
  assert.deepEqual(chunkProducts([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.doesNotThrow(() => assertReadOnlySelect(CCI_PRODUCTS_QUERY));
  assert.throws(() => assertReadOnlySelect("UPDATE CADASTRODESCRICAO SET PRECO = 1"));
});

test("sends an empty catalog once to validate the connector credential", async () => {
  let calls = 0;
  const result = await syncProductBatches({
    products: [],
    storeId: "94eae257-6fb1-4caf-822c-f88f872a7148",
    syncUrl: "https://example.com/api/integrations/cci/sync",
    connectorToken: "test-token",
    batchSize: 500,
    requestTimeoutMs: 1_000,
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ success: true, received: 0, upserted: 0, errors: 0 }));
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, { success: true, received: 0, upserted: 0, errors: 0 });
});
