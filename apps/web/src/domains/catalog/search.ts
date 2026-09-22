import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

/**
 * Busca estruturada + ProductCompatibilityEngine (Fase 3, seções 17-23 do
 * escopo): filtros determinísticos + ranking; nunca o LLM inventando
 * resultados. A IA (Fase 7) só preenche `requirements` a partir da
 * linguagem natural do cliente.
 */
export type CompatibilityStatus = "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";

export interface SearchRequirement {
  level?: "PREFERENCE" | "NUTRITIONAL_CHARACTERISTIC" | "HEALTH_RELATED";
  type: "ALLERGEN_ABSENT" | "ALLERGEN_PRESENT" | "ATTRIBUTE_EQUALS" | "NUTRITION_MAX" | "NUTRITION_MIN" | "PRICE_MAX";
  code?: string;
  value?: string | number | boolean;
}

export interface SearchResultItem {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  hasVariants: boolean;
  sku: string | null;
  imagePath: string | null;
  categoryName: string | null;
  brandName: string | null;
  unit: string;
  currentPrice: number | null;
  availableQuantity: number | null;
  stockStatus: string | null;
  compatibilityStatus: CompatibilityStatus;
  compatibilityResults: { type: string; code: string | null; status: CompatibilityStatus; reason: string }[];
}

export interface SearchParams {
  query?: string;
  categoryId?: string;
  brandId?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  requirements?: SearchRequirement[];
  excludeIncompatible?: boolean;
  sort?: "relevance" | "price_asc" | "price_desc" | "availability";
  limit?: number;
  offset?: number;
}

export async function searchVariants(
  context: TenantContext,
  params: SearchParams,
): Promise<{ rows: SearchResultItem[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_search_variants", {
    p_tenant_id: context.tenant.id,
    p_query: params.query || undefined,
    p_category_id: params.categoryId || undefined,
    p_brand_id: params.brandId || undefined,
    p_price_min: params.priceMin ?? undefined,
    p_price_max: params.priceMax ?? undefined,
    p_in_stock_only: params.inStockOnly ?? false,
    p_requirements: (params.requirements ?? []) as unknown as Json,
    p_exclude_incompatible: params.excludeIncompatible ?? false,
    p_sort: params.sort ?? "relevance",
    p_limit: params.limit ?? 20,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`searchVariants failed: ${error.code}`);

  return {
    total: data?.[0]?.total_count ? Number(data[0].total_count) : 0,
    rows: (data ?? []).map((row) => ({
      variantId: row.variant_id,
      productId: row.product_id,
      productName: row.product_name,
      variantName: row.variant_name,
      hasVariants: row.has_variants,
      sku: row.sku,
      imagePath: row.image_path,
      categoryName: row.category_name,
      brandName: row.brand_name,
      unit: row.unit,
      currentPrice: row.current_price !== null ? Number(row.current_price) : null,
      availableQuantity: row.available_quantity !== null ? Number(row.available_quantity) : null,
      stockStatus: row.stock_status,
      compatibilityStatus: row.compatibility_status as CompatibilityStatus,
      compatibilityResults: (row.compatibility_results ?? []) as SearchResultItem["compatibilityResults"],
    })),
  };
}
