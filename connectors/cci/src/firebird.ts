import { attachAsync, ISOLATION_READ_COMMITTED, type Database, type Options } from "node-firebird";
import type { CciConnectorConfig } from "./config";
import type { CciProductRow } from "./types";

export const CCI_PRODUCTS_QUERY = `
SELECT
    CODIGO,
    DESCRICAO,
    PRECO,
    PRECOCOMPRA,
    ESTOQUE,
    CODIGOBARRAS,
    REFERENCIA,
    LOCALIZACAO,
    FORNECEDOR
FROM CADASTRODESCRICAO
`;

export function assertReadOnlySelect(sql: string): void {
  const normalized = sql.replace(/--.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (!/^select\b/i.test(normalized)) throw new Error("O connector aceita somente SELECT.");
  if (/\b(insert|update|delete|alter|drop|create|execute|merge|recreate|grant|revoke)\b/i.test(normalized)) {
    throw new Error("Comando de escrita detectado na consulta Firebird.");
  }
}

export async function connectToFirebird(config: CciConnectorConfig["firebird"]): Promise<Database> {
  const options: Options = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    encoding: config.encoding,
    numericMode: "safe",
  };
  return attachAsync(options);
}

export async function readCciProducts(database: Database): Promise<CciProductRow[]> {
  assertReadOnlySelect(CCI_PRODUCTS_QUERY);
  return database.withTransaction(
    (transaction) => transaction.queryAsync<CciProductRow>(CCI_PRODUCTS_QUERY),
    {
      isolation: ISOLATION_READ_COMMITTED,
      readOnly: true,
      wait: true,
    },
  );
}
