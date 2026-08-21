import type { CatalogProduct, ProductProvider, ProductSearchInput, ProductSearchResult } from "@/lib/catalog/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type CreateLocalCatalogProductInput = {
  userId: string;
  code: string | null;
  name: string;
  unit: string | null;
  cost: number;
  salePrice: number;
};

export interface LocalCatalogRepository {
  search(input: ProductSearchInput): Promise<CatalogProduct[]>;
  findByCode(userId: string, code: string): Promise<CatalogProduct | null>;
  create(input: CreateLocalCatalogProductInput): Promise<CatalogProduct>;
}

export class LocalProductProvider implements ProductProvider {
  constructor(private readonly repository: LocalCatalogRepository) {}

  async searchProducts(input: ProductSearchInput): Promise<ProductSearchResult[]> {
    return (await this.repository.search(input)).map(toSearchResult);
  }

  async getProductByCode(userId: string, code: string): Promise<ProductSearchResult | null> {
    const product = await this.repository.findByCode(userId, code);
    return product ? toSearchResult(product) : null;
  }
}

export class SupabaseLocalCatalogRepository implements LocalCatalogRepository {
  async search(input: ProductSearchInput): Promise<CatalogProduct[]> {
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("product_catalog")
      .select("*")
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false })
      .limit(input.limit ?? 20);

    if (input.code) query = query.ilike("code", `%${input.code.trim()}%`);
    else if (input.query) query = query.ilike("name", `%${input.query.trim()}%`);

    const { data, error } = await query;
    if (error) throw new Error("Não foi possível consultar o catálogo local.");
    return (data ?? []).map(toCatalogProduct);
  }

  async findByCode(userId: string, code: string): Promise<CatalogProduct | null> {
    const normalizedCode = code.trim();
    if (!normalizedCode) return null;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("product_catalog")
      .select("*")
      .eq("user_id", userId)
      .eq("code", normalizedCode)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar o catálogo local.");
    return data ? toCatalogProduct(data) : null;
  }

  async create(input: CreateLocalCatalogProductInput): Promise<CatalogProduct> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("product_catalog")
      .insert({
        user_id: input.userId,
        code: input.code?.trim() || null,
        name: input.name.trim(),
        unit: input.unit?.trim() || null,
        cost: input.cost,
        sale_price: input.salePrice,
        source: "local",
        sync_status: "local_only",
      })
      .select("*")
      .single();
    if (error) throw new Error("Não foi possível criar o produto no catálogo local.");
    return toCatalogProduct(data);
  }
}

export function toSearchResult(product: CatalogProduct): ProductSearchResult {
  const { id, code, name, unit, cost, salePrice, source, externalId, syncStatus } = product;
  return { id, code, name, unit, cost, salePrice, source, externalId, syncStatus };
}

function toCatalogProduct(row: Record<string, unknown>): CatalogProduct {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    code: typeof row.code === "string" ? row.code : null,
    name: String(row.name),
    unit: typeof row.unit === "string" ? row.unit : null,
    cost: toNumberOrNull(row.cost),
    salePrice: toNumberOrNull(row.sale_price),
    source: row.source === "tagplus" ? "tagplus" : "local",
    externalId: typeof row.external_id === "string" ? row.external_id : null,
    syncStatus: isSyncStatus(row.sync_status) ? row.sync_status : "local_only",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value !== "") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  return null;
}

function isSyncStatus(value: unknown): value is CatalogProduct["syncStatus"] {
  return value === "local_only" || value === "pending" || value === "synced" || value === "error";
}
