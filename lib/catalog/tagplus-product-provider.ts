import type { ProductProvider, ProductSearchInput, ProductSearchResult } from "@/lib/catalog/types";
import { TAGPLUS_API_BASE_URL, parseProductsResponse } from "@/lib/tagplus/oauth";
import { getValidTagPlusAccessToken } from "@/lib/tagplus/service";

/**
 * Read-only adapter kept intentionally small until the TagPlus schema is validated
 * with a real customer account. The domain only sees ProductProvider.
 */
export class TagPlusProductProvider implements ProductProvider {
  async searchProducts(input: ProductSearchInput): Promise<ProductSearchResult[]> {
    const accessToken = await getValidTagPlusAccessToken(input.userId);
    const response = await fetch(`${TAGPLUS_API_BASE_URL}/produtos`, {
      headers: { Authorization: `Bearer ${accessToken}`, "X-Api-Version": "2.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Não foi possível consultar produtos no TagPlus.");
    const products = parseProductsResponse(await response.json());
    const query = (input.code ?? input.query ?? "").trim().toLocaleLowerCase("pt-BR");
    return products.map(toSearchResult).filter((product) => !query || product.code?.toLocaleLowerCase("pt-BR").includes(query) || product.name.toLocaleLowerCase("pt-BR").includes(query)).slice(0, input.limit ?? 20);
  }

  async getProductByCode(userId: string, code: string): Promise<ProductSearchResult | null> {
    const products = await this.searchProducts({ userId, code, limit: 20 });
    return products.find((product) => product.code === code) ?? null;
  }
}

function toSearchResult(product: Record<string, unknown>): ProductSearchResult {
  const code = stringValue(product.codigo ?? product.code ?? product.codigo_interno);
  const name = stringValue(product.descricao ?? product.nome ?? product.name) ?? "Produto sem descrição";
  return {
    id: stringValue(product.id) ?? code ?? name,
    code,
    name,
    unit: stringValue(product.unidade ?? product.unit),
    cost: numberValue(product.custo ?? product.valor_custo),
    salePrice: numberValue(product.valor_venda ?? product.preco_venda ?? product.sale_price),
    source: "tagplus",
    externalId: stringValue(product.id),
    syncStatus: "synced",
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
