export type ExternalProduct = {
  externalId: string;
  description: string;
  salePrice: number | null;
  costPrice: number | null;
  stock: number | null;
  barcode: string | null;
  reference: string | null;
  location: string | null;
  supplier: string | null;
  rawData?: Record<string, unknown> | null;
};

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
