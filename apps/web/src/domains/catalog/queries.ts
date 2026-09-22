import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";
export type { CategoryOption } from "./category-tree";
import type { EffectiveAllergen, EffectiveAttribute, EffectiveNutrition, NutrientDefinition } from "./characteristics";
import { flattenCategoryTree, type CategoryOption } from "./category-tree";
import { isStockStatus, type StockStatus } from "./labels";

// -----------------------------------------------------------------------------
// Opções de formulário e filtros
// -----------------------------------------------------------------------------

export interface NamedOption {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CatalogOptions {
  categories: CategoryOption[];
  brands: NamedOption[];
  suppliers: NamedOption[];
}

export async function getCatalogOptions(context: TenantContext): Promise<CatalogOptions> {
  const supabase = await createClient();
  const [categories, brands, suppliers] = await Promise.all([
    supabase.from("categories").select("id, name, parent_id, is_active, sort_order").eq("tenant_id", context.tenant.id),
    supabase.from("brands").select("id, name, is_active").eq("tenant_id", context.tenant.id).order("name"),
    supabase.from("suppliers").select("id, name, is_active").eq("tenant_id", context.tenant.id).order("name"),
  ]);

  return {
    categories: flattenCategoryTree(categories.data ?? []),
    brands: (brands.data ?? []).map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })),
    suppliers: (suppliers.data ?? []).map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })),
  };
}

// -----------------------------------------------------------------------------
// Lista de produtos
// -----------------------------------------------------------------------------

export const PRODUCT_PAGE_SIZE = 25;
export const PRODUCT_SORTS = ["name", "price_asc", "price_desc", "stock", "recent"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductListParams {
  query?: string;
  categoryId?: string;
  brandId?: string;
  status: "active" | "inactive" | "all";
  stockStatus?: "LOW" | "OUT";
  sort: ProductSort;
  page: number;
}

export interface ProductListItem {
  id: string;
  name: string;
  imagePath: string | null;
  categoryName: string | null;
  brandName: string | null;
  unit: string;
  isActive: boolean;
  hasVariants: boolean;
  variantCount: number;
  sku: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  salePrice: number | null;
  promoPrice: number | null;
  availableQuantity: number | null;
  stockStatus: StockStatus | null;
}

export async function searchProducts(
  context: TenantContext,
  params: ProductListParams,
): Promise<{ rows: ProductListItem[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_search_products", {
    p_tenant_id: context.tenant.id,
    p_query: params.query || undefined,
    p_category_id: params.categoryId,
    p_brand_id: params.brandId,
    p_status: params.status,
    p_stock_status: params.stockStatus,
    p_sort: params.sort,
    p_limit: PRODUCT_PAGE_SIZE,
    p_offset: (params.page - 1) * PRODUCT_PAGE_SIZE,
  });
  if (error) throw new Error(`catalog_search_products failed: ${error.message}`);

  const rows = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    imagePath: row.image_path,
    categoryName: row.category_name,
    brandName: row.brand_name,
    unit: row.unit,
    isActive: row.is_active,
    hasVariants: row.has_variants,
    variantCount: Number(row.variant_count),
    sku: row.sku,
    minPrice: row.min_price === null ? null : Number(row.min_price),
    maxPrice: row.max_price === null ? null : Number(row.max_price),
    salePrice: row.sale_price === null ? null : Number(row.sale_price),
    promoPrice: row.promo_price === null ? null : Number(row.promo_price),
    availableQuantity: row.available_quantity === null ? null : Number(row.available_quantity),
    stockStatus: isStockStatus(row.stock_status) ? row.stock_status : null,
  }));
  return { rows, total: Number(data?.[0]?.total_count ?? 0) };
}

// -----------------------------------------------------------------------------
// Detalhe do produto
// -----------------------------------------------------------------------------

export interface VariantDetail {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  isDefault: boolean;
  isActive: boolean;
  variantIsActive: boolean;
  ownSalePrice: number | null;
  ownPromoPrice: number | null;
  ownMinStock: number | null;
  salePrice: number;
  promoPrice: number | null;
  currentPrice: number;
  minStock: number;
  physical: number | null;
  reserved: number | null;
  available: number | null;
  stockStatus: StockStatus | null;
  costPrice: number | null;
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  unit: string;
  salePrice: number;
  promoPrice: number | null;
  minStock: number;
  imagePath: string | null;
  isActive: boolean;
  hasVariants: boolean;
  trackLots: boolean;
  createdAt: string;
  updatedAt: string;
  variants: VariantDetail[];
  defaultVariant: VariantDetail;
  canSeeCosts: boolean;
}

const toNumber = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

export async function getProductDetail(context: TenantContext, productId: string): Promise<ProductDetail | null> {
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, name, description, category_id, brand_id, supplier_id, unit, sale_price, promo_price, min_stock, image_path, is_active, has_variants, track_lots, archived_at, created_at, updated_at, category:categories(name), brand:brands(name), supplier:suppliers(name)",
    )
    .eq("id", productId)
    .eq("tenant_id", context.tenant.id)
    .is("archived_at", null)
    .maybeSingle();

  if (!product) return null;

  const canSeeCosts = context.can("catalog.costs");
  const { data: variantRows } = await supabase
    .from("product_variant_details")
    .select("*")
    .eq("product_id", productId)
    .order("is_default", { ascending: false })
    .order("sort_order")
    .order("name");

  const variantIds = (variantRows ?? []).map((row) => row.variant_id!);
  const costs = new Map<string, number>();
  if (canSeeCosts && variantIds.length) {
    const { data: costRows } = await supabase
      .from("product_variant_costs")
      .select("variant_id, cost_price")
      .in("variant_id", variantIds);
    for (const row of costRows ?? []) costs.set(row.variant_id, Number(row.cost_price));
  }

  const variants: VariantDetail[] = (variantRows ?? []).map((row) => ({
    id: row.variant_id!,
    name: row.name ?? "",
    sku: row.sku,
    barcode: row.barcode,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    variantIsActive: Boolean(row.variant_is_active),
    ownSalePrice: toNumber(row.own_sale_price),
    ownPromoPrice: toNumber(row.own_promo_price),
    ownMinStock: toNumber(row.own_min_stock),
    salePrice: Number(row.effective_sale_price),
    promoPrice: toNumber(row.effective_promo_price),
    currentPrice: Number(row.current_price),
    minStock: Number(row.effective_min_stock),
    physical: toNumber(row.physical_quantity),
    reserved: toNumber(row.reserved_quantity),
    available: toNumber(row.available_quantity),
    stockStatus: isStockStatus(row.stock_status) ? row.stock_status : null,
    costPrice: costs.get(row.variant_id!) ?? null,
  }));

  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
  if (!defaultVariant) return null;

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    categoryId: product.category_id,
    categoryName: product.category?.name ?? null,
    brandId: product.brand_id,
    brandName: product.brand?.name ?? null,
    supplierId: product.supplier_id,
    supplierName: product.supplier?.name ?? null,
    unit: product.unit,
    salePrice: Number(product.sale_price),
    promoPrice: toNumber(product.promo_price),
    minStock: Number(product.min_stock),
    imagePath: product.image_path,
    isActive: product.is_active,
    hasVariants: product.has_variants,
    trackLots: product.track_lots,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    variants,
    defaultVariant,
    canSeeCosts,
  };
}

// -----------------------------------------------------------------------------
// Características
// -----------------------------------------------------------------------------

export interface AttributeDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dataType: Enums<"attribute_data_type">;
  unit: string | null;
  groupName: string | null;
  options: { id: string; label: string; isActive: boolean }[];
}

export interface AttributeValue {
  attributeId: string;
  valueBoolean: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
  optionId: string | null;
}

export interface AllergenDefinition {
  code: string;
  name: string;
  description: string;
}

export interface AllergenValue {
  code: string;
  presence: Enums<"tri_state">;
  mayContainTraces: boolean;
  source: Enums<"info_source">;
  notes: string | null;
}

export interface NutritionValue {
  servingSize: number;
  servingUnit: string;
  servingDescription: string | null;
  servingsPerContainer: number | null;
  source: Enums<"info_source">;
  sourceNotes: string | null;
  values: Record<string, number>;
}

export interface CharacteristicsScopeData {
  attributes: AttributeDefinition[];
  allergens: AllergenDefinition[];
  nutrients: (NutrientDefinition & { category: string; isCore: boolean })[];
  /** Valores do escopo editado (produto ou variante). */
  own: { attributes: AttributeValue[]; allergens: AllergenValue[]; nutrition: NutritionValue | null };
  /** Valores do produto — herdados quando o escopo é uma variante. */
  inherited: { attributes: AttributeValue[]; allergens: AllergenValue[]; nutrition: NutritionValue | null } | null;
}

async function loadScopeValues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  variantId: string | null,
) {
  const scope = <T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
    query: T,
  ) => (variantId ? query.eq("variant_id", variantId) : query.is("variant_id", null));

  const [attributes, allergens, nutrition] = await Promise.all([
    scope(
      supabase
        .from("product_attribute_values")
        .select("attribute_id, value_boolean, value_number, value_text, option_id")
        .eq("product_id", productId),
    ),
    scope(
      supabase
        .from("product_allergens")
        .select("allergen_code, presence, may_contain_traces, source, notes")
        .eq("product_id", productId),
    ),
    scope(
      supabase
        .from("product_nutrition")
        .select(
          "serving_size, serving_unit, serving_description, servings_per_container, source, source_notes, values:product_nutrition_values(nutrient_code, amount)",
        )
        .eq("product_id", productId),
    ).maybeSingle(),
  ]);

  return {
    attributes: (attributes.data ?? []).map((row) => ({
      attributeId: row.attribute_id,
      valueBoolean: row.value_boolean,
      valueNumber: toNumber(row.value_number),
      valueText: row.value_text,
      optionId: row.option_id,
    })),
    allergens: (allergens.data ?? []).map((row) => ({
      code: row.allergen_code,
      presence: row.presence,
      mayContainTraces: row.may_contain_traces,
      source: row.source,
      notes: row.notes,
    })),
    nutrition: nutrition.data
      ? {
          servingSize: Number(nutrition.data.serving_size),
          servingUnit: nutrition.data.serving_unit,
          servingDescription: nutrition.data.serving_description,
          servingsPerContainer: toNumber(nutrition.data.servings_per_container),
          source: nutrition.data.source,
          sourceNotes: nutrition.data.source_notes,
          values: Object.fromEntries(
            (nutrition.data.values ?? []).map((value) => [value.nutrient_code, Number(value.amount)]),
          ),
        }
      : null,
  };
}

export async function getCharacteristicsScope(
  context: TenantContext,
  productId: string,
  variantId: string | null,
): Promise<CharacteristicsScopeData> {
  const supabase = await createClient();
  const [attributeDefs, allergenDefs, nutrientDefs, own, inherited] = await Promise.all([
    supabase
      .from("product_attributes")
      .select(
        "id, code, name, description, data_type, unit, group_name, sort_order, options:product_attribute_options(id, label, sort_order, is_active)",
      )
      .eq("tenant_id", context.tenant.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase.from("allergens").select("code, name, description").order("sort_order"),
    supabase.from("nutrients").select("code, name, unit, category, is_core").order("sort_order"),
    loadScopeValues(supabase, productId, variantId),
    variantId ? loadScopeValues(supabase, productId, null) : Promise.resolve(null),
  ]);

  return {
    attributes: (attributeDefs.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      dataType: row.data_type,
      unit: row.unit,
      groupName: row.group_name,
      options: (row.options ?? [])
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pt-BR"))
        .map((option) => ({ id: option.id, label: option.label, isActive: option.is_active })),
    })),
    allergens: allergenDefs.data ?? [],
    nutrients: (nutrientDefs.data ?? []).map((row) => ({
      code: row.code,
      name: row.name,
      unit: row.unit,
      category: row.category,
      isCore: row.is_core,
    })),
    own,
    inherited,
  };
}

export interface EffectiveCharacteristics {
  allergens: EffectiveAllergen[];
  attributes: EffectiveAttribute[];
  nutrition: EffectiveNutrition | null;
  nutrients: NutrientDefinition[];
}

export async function getEffectiveCharacteristics(variantId: string): Promise<EffectiveCharacteristics> {
  const supabase = await createClient();
  const [allergens, attributes, nutrition, nutrients] = await Promise.all([
    supabase
      .from("effective_variant_allergens")
      .select("allergen_code, allergen_name, presence, may_contain_traces, sort_order")
      .eq("variant_id", variantId)
      .order("sort_order"),
    supabase
      .from("effective_variant_attributes")
      .select(
        "attribute_code, attribute_name, data_type, unit, value_boolean, value_number, value_text, option_label, sort_order",
      )
      .eq("variant_id", variantId)
      .order("sort_order"),
    supabase
      .from("effective_variant_nutrition")
      .select("serving_size, serving_unit, nutrient_values")
      .eq("variant_id", variantId)
      .maybeSingle(),
    supabase.from("nutrients").select("code, name, unit").order("sort_order"),
  ]);

  return {
    allergens: (allergens.data ?? []).map((row) => ({
      code: row.allergen_code ?? "",
      name: row.allergen_name ?? "",
      presence: row.presence ?? "UNKNOWN",
      mayContainTraces: Boolean(row.may_contain_traces),
    })),
    attributes: (attributes.data ?? []).map((row) => ({
      code: row.attribute_code ?? "",
      name: row.attribute_name ?? "",
      dataType: row.data_type ?? "TEXT",
      unit: row.unit,
      valueBoolean: row.value_boolean,
      valueNumber: toNumber(row.value_number),
      valueText: row.value_text,
      optionLabel: row.option_label,
    })),
    nutrition: nutrition.data
      ? {
          servingSize: Number(nutrition.data.serving_size),
          servingUnit: nutrition.data.serving_unit ?? "g",
          values: Object.fromEntries(
            Object.entries((nutrition.data.nutrient_values ?? {}) as Record<string, number>).map(([code, amount]) => [
              code,
              Number(amount),
            ]),
          ),
        }
      : null,
    nutrients: nutrients.data ?? [],
  };
}

// -----------------------------------------------------------------------------
// Cadastros (tela de gestão)
// -----------------------------------------------------------------------------

export interface TaxonomyData {
  categories: (CategoryOption & { description: string | null; productCount: number })[];
  brands: (NamedOption & { productCount: number })[];
  suppliers: {
    id: string;
    name: string;
    legalName: string | null;
    document: string | null;
    email: string | null;
    phone: string | null;
    contactName: string | null;
    notes: string | null;
    isActive: boolean;
    productCount: number;
  }[];
  attributes: (AttributeDefinition & {
    isSearchable: boolean;
    isFilterable: boolean;
    isCompatibilityEnabled: boolean;
    isVariantAxis: boolean;
    isActive: boolean;
    usageCount: number;
  })[];
}

const countOf = (value: { count: number }[] | null | undefined) => value?.[0]?.count ?? 0;

export async function getTaxonomy(context: TenantContext): Promise<TaxonomyData> {
  const supabase = await createClient();
  const tenantId = context.tenant.id;
  const [categories, brands, suppliers, attributes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, parent_id, description, is_active, sort_order, products(count)")
      .eq("tenant_id", tenantId),
    supabase.from("brands").select("id, name, is_active, products(count)").eq("tenant_id", tenantId).order("name"),
    supabase
      .from("suppliers")
      .select("id, name, legal_name, document, email, phone, contact_name, notes, is_active, products(count)")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("product_attributes")
      .select(
        "id, code, name, description, data_type, unit, group_name, is_searchable, is_filterable, is_compatibility_enabled, is_variant_axis, is_active, sort_order, options:product_attribute_options(id, label, sort_order, is_active), product_attribute_values(count)",
      )
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("name"),
  ]);

  const categoryRows = categories.data ?? [];
  const extra = new Map(
    categoryRows.map((row) => [row.id, { description: row.description, productCount: countOf(row.products) }]),
  );

  return {
    categories: flattenCategoryTree(categoryRows).map((category) => ({
      ...category,
      description: extra.get(category.id)?.description ?? null,
      productCount: extra.get(category.id)?.productCount ?? 0,
    })),
    brands: (brands.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      productCount: countOf(row.products),
    })),
    suppliers: (suppliers.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      legalName: row.legal_name,
      document: row.document,
      email: row.email,
      phone: row.phone,
      contactName: row.contact_name,
      notes: row.notes,
      isActive: row.is_active,
      productCount: countOf(row.products),
    })),
    attributes: (attributes.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      dataType: row.data_type,
      unit: row.unit,
      groupName: row.group_name,
      isSearchable: row.is_searchable,
      isFilterable: row.is_filterable,
      isCompatibilityEnabled: row.is_compatibility_enabled,
      isVariantAxis: row.is_variant_axis,
      isActive: row.is_active,
      usageCount: countOf(row.product_attribute_values),
      options: (row.options ?? [])
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pt-BR"))
        .map((option) => ({ id: option.id, label: option.label, isActive: option.is_active })),
    })),
  };
}
