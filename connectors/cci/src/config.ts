import type { SupportedCharacterSet } from "node-firebird";

export type CciConnectorConfig = {
  firebird: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    encoding: SupportedCharacterSet;
  };
  storeId: string;
  syncUrl: string;
  connectorToken: string;
  batchSize: number;
  requestTimeoutMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CciConnectorConfig {
  return {
    firebird: {
      host: optional(env, "CCI_FIREBIRD_HOST", "localhost"),
      port: positiveInteger(env.CCI_FIREBIRD_PORT, 3050, "CCI_FIREBIRD_PORT"),
      database: required(env, "CCI_FIREBIRD_DATABASE"),
      user: required(env, "CCI_FIREBIRD_USER"),
      password: required(env, "CCI_FIREBIRD_PASSWORD"),
      encoding: supportedEncoding(optional(env, "CCI_FIREBIRD_ENCODING", "WIN1252")),
    },
    storeId: required(env, "CCI_STORE_ID"),
    syncUrl: validHttpsUrl(required(env, "CCI_SYNC_URL")),
    connectorToken: required(env, "CCI_CONNECTOR_TOKEN"),
    batchSize: boundedInteger(env.CCI_BATCH_SIZE, 500, 1, 500, "CCI_BATCH_SIZE"),
    requestTimeoutMs: boundedInteger(env.CCI_REQUEST_TIMEOUT_MS, 30_000, 1_000, 120_000, "CCI_REQUEST_TIMEOUT_MS"),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  return env[name]?.trim() || fallback;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  return boundedInteger(value, fallback, 1, 65_535, name);
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return parsed;
}

function validHttpsUrl(value: string): string {
  const url = new URL(value);
  const localDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error("CCI_SYNC_URL deve usar HTTPS (HTTP só é aceito em localhost). ");
  }
  return url.toString();
}

function supportedEncoding(value: string): SupportedCharacterSet {
  const supported = new Set<SupportedCharacterSet>([
    "NONE", "CP943C", "DOS737", "DOS775", "DOS858", "DOS862", "DOS864", "DOS866", "DOS869",
    "GB18030", "GBK", "ISO8859_1", "ISO8859_2", "ISO8859_3", "ISO8859_4", "ISO8859_5",
    "ISO8859_6", "ISO8859_7", "ISO8859_8", "ISO8859_9", "ISO8859_13", "KOI8R", "KOI8U",
    "TIS620", "UTF8", "WIN1251", "WIN1252", "WIN1253", "WIN1254", "WIN1255", "WIN1256",
    "WIN1257", "WIN1258", "WIN_1258",
  ]);
  const normalized = value.toUpperCase() as SupportedCharacterSet;
  if (!supported.has(normalized)) throw new Error(`CCI_FIREBIRD_ENCODING não suportado: ${value}`);
  return normalized;
}
