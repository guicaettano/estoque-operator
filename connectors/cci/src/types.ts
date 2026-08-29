import type { ExternalProduct } from "../../../lib/cci/types";

export type CciProductRow = {
  CODIGO: number | string | null;
  DESCRICAO: string | null;
  PRECO: number | string | null;
  PRECOCOMPRA: number | string | null;
  ESTOQUE: number | string | null;
  CODIGOBARRAS: string | number | null;
  REFERENCIA: string | null;
  LOCALIZACAO: string | null;
  FORNECEDOR: string | null;
};

export type NormalizedCciProduct = ExternalProduct & {
  rawData: Record<string, unknown>;
};
