export type ProductProviderKind = "local" | "tagplus";
export type CatalogProductSource = ProductProviderKind;
export type CatalogSyncStatus = "local_only" | "pending" | "synced" | "error";

export type CatalogProduct = {
  id: string;
  userId: string;
  code: string | null;
  name: string;
  unit: string | null;
  cost: number | null;
  salePrice: number | null;
  source: CatalogProductSource;
  externalId: string | null;
  syncStatus: CatalogSyncStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProductSearchInput = {
  userId: string;
  code?: string | null;
  query?: string | null;
  limit?: number;
};

export type ProductSearchResult = Pick<CatalogProduct, "id" | "code" | "name" | "unit" | "cost" | "salePrice" | "source" | "externalId" | "syncStatus">;

export interface ProductProvider {
  searchProducts(input: ProductSearchInput): Promise<ProductSearchResult[]>;
  getProductByCode(userId: string, code: string): Promise<ProductSearchResult | null>;
}
