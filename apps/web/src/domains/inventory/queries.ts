import "server-only";
import { isStockStatus, type StockStatus } from "@/domains/catalog/labels";
import type { TenantContext } from "@/domains/tenants/context";
import { searchNormalize } from "@/lib/codes";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";
import { isExpiryStatus, type ExpiryStatus } from "./labels";

const toNumber = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

/** Escapa curingas do LIKE/ILIKE usados em filtros PostgREST. */
function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export interface InventorySummary {
  activeVariants: number;
  lowStock: number;
  outOfStock: number;
  expiringLots: number;
  expiredLots: number;
  expiryAlertDays: number;
}

export async function getInventorySummary(context: TenantContext): Promise<InventorySummary> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("inventory_summary", { p_tenant_id: context.tenant.id });
  const summary = (data ?? {}) as Record<string, number>;
  return {
    activeVariants: Number(summary.active_variants ?? 0),
    lowStock: Number(summary.low_stock ?? 0),
    outOfStock: Number(summary.out_of_stock ?? 0),
    expiringLots: Number(summary.expiring_lots ?? 0),
    expiredLots: Number(summary.expired_lots ?? 0),
    expiryAlertDays: Number(summary.expiry_alert_days ?? 30),
  };
}

// -----------------------------------------------------------------------------
// Posição de estoque
// -----------------------------------------------------------------------------

export const INVENTORY_PAGE_SIZE = 30;
export const INVENTORY_FILTERS = ["LOW", "OUT", "EXPIRING", "EXPIRED"] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  hasVariants: boolean;
  sku: string | null;
  imagePath: string | null;
  categoryName: string | null;
  unit: string;
  isActive: boolean;
  trackLots: boolean;
  physical: number;
  reserved: number;
  available: number;
  minStock: number;
  stockStatus: StockStatus;
  nextExpiration: string | null;
  expiredQuantity: number;
  expiringQuantity: number;
}

export async function listInventory(
  context: TenantContext,
  params: { query?: string; filter?: InventoryFilter; page: number },
): Promise<{ rows: InventoryRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("inventory_variant_overview")
    .select("*", { count: "exact" })
    .eq("tenant_id", context.tenant.id);

  if (params.query) query = query.ilike("search_text", likePattern(searchNormalize(params.query)));
  switch (params.filter) {
    case "LOW":
    case "OUT":
      query = query.eq("stock_status", params.filter).eq("is_active", true);
      break;
    case "EXPIRING":
      query = query.gt("expiring_quantity", 0);
      break;
    case "EXPIRED":
      query = query.gt("expired_quantity", 0);
      break;
  }

  const from = (params.page - 1) * INVENTORY_PAGE_SIZE;
  const { data, count, error } = await query
    .order("available_quantity", { ascending: true })
    .order("product_name")
    .order("variant_name")
    .range(from, from + INVENTORY_PAGE_SIZE - 1);
  if (error) throw new Error(`listInventory failed: ${error.code}`);

  return {
    total: count ?? 0,
    rows: (data ?? []).map((row) => ({
      variantId: row.variant_id!,
      productId: row.product_id!,
      productName: row.product_name ?? "",
      variantName: row.variant_name ?? "",
      hasVariants: Boolean(row.has_variants),
      sku: row.sku,
      imagePath: row.image_path,
      categoryName: row.category_name,
      unit: row.unit ?? "UN",
      isActive: Boolean(row.is_active),
      trackLots: Boolean(row.track_lots),
      physical: Number(row.physical_quantity ?? 0),
      reserved: Number(row.reserved_quantity ?? 0),
      available: Number(row.available_quantity ?? 0),
      minStock: Number(row.min_stock ?? 0),
      stockStatus: isStockStatus(row.stock_status) ? row.stock_status : "OK",
      nextExpiration: row.next_expiration,
      expiredQuantity: Number(row.expired_quantity ?? 0),
      expiringQuantity: Number(row.expiring_quantity ?? 0),
    })),
  };
}

// -----------------------------------------------------------------------------
// Lotes
// -----------------------------------------------------------------------------

export interface LotRow {
  lotId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  hasVariants: boolean;
  sku: string | null;
  lotCode: string;
  manufacturedOn: string | null;
  expiresOn: string | null;
  quantity: number;
  receivedQuantity: number;
  supplierName: string | null;
  expiryStatus: ExpiryStatus;
  daysToExpiry: number | null;
}

function mapLot(row: {
  lot_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  product_name: string | null;
  variant_name: string | null;
  has_variants: boolean | null;
  sku: string | null;
  lot_code: string | null;
  manufactured_on: string | null;
  expires_on: string | null;
  quantity: number | null;
  received_quantity: number | null;
  supplier_name: string | null;
  expiry_status: string | null;
  days_to_expiry: number | null;
}): LotRow {
  return {
    lotId: row.lot_id!,
    productId: row.product_id!,
    variantId: row.variant_id!,
    productName: row.product_name ?? "",
    variantName: row.variant_name ?? "",
    hasVariants: Boolean(row.has_variants),
    sku: row.sku,
    lotCode: row.lot_code ?? "",
    manufacturedOn: row.manufactured_on,
    expiresOn: row.expires_on,
    quantity: Number(row.quantity ?? 0),
    receivedQuantity: Number(row.received_quantity ?? 0),
    supplierName: row.supplier_name,
    expiryStatus: isExpiryStatus(row.expiry_status) ? row.expiry_status : "NO_EXPIRY",
    daysToExpiry: toNumber(row.days_to_expiry),
  };
}

export const LOT_FILTERS = ["EXPIRING", "EXPIRED", "ALL"] as const;
export type LotFilter = (typeof LOT_FILTERS)[number];

export async function listLots(
  context: TenantContext,
  params: { filter?: LotFilter; query?: string; page: number },
): Promise<{ rows: LotRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("inventory_lot_overview")
    .select("*", { count: "exact" })
    .eq("tenant_id", context.tenant.id);

  if (params.filter === "EXPIRING" || params.filter === "EXPIRED") {
    query = query.eq("expiry_status", params.filter).gt("quantity", 0);
  } else if (params.filter !== "ALL") {
    query = query.gt("quantity", 0);
  }
  if (params.query) {
    // Vírgulas e parênteses têm significado na sintaxe `or` do PostgREST.
    const pattern = likePattern(params.query.replace(/[,()"]/g, " ").trim());
    query = query.or(`lot_code.ilike.${pattern},product_name.ilike.${pattern},sku.ilike.${pattern}`);
  }

  const from = (params.page - 1) * INVENTORY_PAGE_SIZE;
  const { data, count, error } = await query
    .order("expires_on", { ascending: true, nullsFirst: false })
    .order("product_name")
    .range(from, from + INVENTORY_PAGE_SIZE - 1);
  if (error) throw new Error(`listLots failed: ${error.code}`);
  return { rows: (data ?? []).map(mapLot), total: count ?? 0 };
}

export async function listProductLots(context: TenantContext, productId: string): Promise<LotRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_lot_overview")
    .select("*")
    .eq("tenant_id", context.tenant.id)
    .eq("product_id", productId)
    .order("expires_on", { ascending: true, nullsFirst: false });
  return (data ?? []).map(mapLot);
}

// -----------------------------------------------------------------------------
// Movimentações
// -----------------------------------------------------------------------------

export interface MovementRow {
  id: string;
  type: Enums<"stock_movement_type">;
  origin: Enums<"stock_movement_origin">;
  productId: string;
  productName: string;
  variantName: string;
  hasVariants: boolean;
  quantity: number;
  physicalDelta: number;
  reservedDelta: number;
  physicalAfter: number;
  reservedAfter: number;
  unitCost: number | null;
  reason: string | null;
  actorName: string | null;
  actorType: Enums<"audit_actor_type">;
  lots: { code: string; delta: number }[];
  createdAt: string;
}

export const MOVEMENT_PAGE_SIZE = 30;

export async function listMovements(
  context: TenantContext,
  params: { type?: Enums<"stock_movement_type">; productId?: string; page: number; pageSize?: number },
): Promise<{ rows: MovementRow[]; total: number }> {
  const supabase = await createClient();
  const pageSize = params.pageSize ?? MOVEMENT_PAGE_SIZE;
  let query = supabase
    .from("stock_movements")
    .select(
      "id, type, origin, product_id, quantity, physical_delta, reserved_delta, physical_after, reserved_after, unit_cost, reason, actor_user_id, actor_type, created_at, variant:product_variants(name), product:products(name, has_variants), lots:stock_movement_lots(quantity_delta, lot:stock_lots(lot_code))",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenant.id);

  if (params.type) query = query.eq("type", params.type);
  if (params.productId) query = query.eq("product_id", params.productId);

  const from = (params.page - 1) * pageSize;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`listMovements failed: ${error.code}`);

  const actorIds = [...new Set((data ?? []).map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const profile of profiles ?? []) names.set(profile.id, profile.full_name || profile.email || "Usuário");
  }

  return {
    total: count ?? 0,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      origin: row.origin,
      productId: row.product_id,
      productName: row.product?.name ?? "",
      variantName: row.variant?.name ?? "",
      hasVariants: Boolean(row.product?.has_variants),
      quantity: Number(row.quantity),
      physicalDelta: Number(row.physical_delta),
      reservedDelta: Number(row.reserved_delta),
      physicalAfter: Number(row.physical_after),
      reservedAfter: Number(row.reserved_after),
      unitCost: toNumber(row.unit_cost),
      reason: row.reason,
      actorName: row.actor_user_id ? (names.get(row.actor_user_id) ?? "Usuário") : null,
      actorType: row.actor_type,
      lots: (row.lots ?? []).map((lot) => ({ code: lot.lot?.lot_code ?? "", delta: Number(lot.quantity_delta) })),
      createdAt: row.created_at,
    })),
  };
}

// -----------------------------------------------------------------------------
// Seletor de variantes (formulários de estoque)
// -----------------------------------------------------------------------------

export interface VariantOption {
  variantId: string;
  productId: string;
  label: string;
  sku: string | null;
  unit: string;
  trackLots: boolean;
  physical: number;
  available: number;
}

export async function lookupVariants(context: TenantContext, query: string): Promise<VariantOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("catalog_lookup_variants", {
    p_tenant_id: context.tenant.id,
    p_query: query || undefined,
    p_limit: 20,
  });
  return (data ?? []).map((row) => ({
    variantId: row.variant_id,
    productId: row.product_id,
    label: row.has_variants ? `${row.product_name} — ${row.variant_name}` : row.product_name,
    sku: row.sku,
    unit: row.unit,
    trackLots: row.track_lots,
    physical: Number(row.physical_quantity ?? 0),
    available: Number(row.available_quantity ?? 0),
  }));
}

/** Lotes com saldo de uma variante (seleção em perdas/ajustes). */
export async function listVariantLots(context: TenantContext, variantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_lot_overview")
    .select("lot_id, lot_code, expires_on, quantity, expiry_status")
    .eq("tenant_id", context.tenant.id)
    .eq("variant_id", variantId)
    .order("expires_on", { ascending: true, nullsFirst: false });
  return (data ?? []).map((row) => ({
    lotId: row.lot_id!,
    lotCode: row.lot_code ?? "",
    expiresOn: row.expires_on,
    quantity: Number(row.quantity ?? 0),
    expiryStatus: isExpiryStatus(row.expiry_status) ? row.expiry_status : ("NO_EXPIRY" as ExpiryStatus),
  }));
}
