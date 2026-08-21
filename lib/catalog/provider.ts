import { LocalProductProvider, SupabaseLocalCatalogRepository } from "@/lib/catalog/local-product-provider";
import { TagPlusProductProvider } from "@/lib/catalog/tagplus-product-provider";
import type { ProductProvider, ProductProviderKind } from "@/lib/catalog/types";

export function getProductProviderKind(value = process.env.PRODUCT_PROVIDER): ProductProviderKind {
  return value?.toLowerCase() === "tagplus" ? "tagplus" : "local";
}

export function createProductProvider(value = process.env.PRODUCT_PROVIDER): ProductProvider {
  return getProductProviderKind(value) === "tagplus"
    ? new TagPlusProductProvider()
    : new LocalProductProvider(new SupabaseLocalCatalogRepository());
}
