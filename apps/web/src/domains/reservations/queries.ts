import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

export const RESERVATION_PAGE_SIZE = 30;

/** Reservas que vencem nas próximas `hours` horas e ainda não foram varridas (usado no sino de notificações). */
export async function getReservationsExpiringSoonCount(context: TenantContext, hours = 24): Promise<number> {
  const supabase = await createClient();
  const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", context.tenant.id)
    .in("status", ["PENDING", "CONFIRMED", "AWAITING_PICKUP"])
    .not("expires_at", "is", null)
    .lte("expires_at", until);
  if (error) throw new Error(`getReservationsExpiringSoonCount failed: ${error.code}`);
  return count ?? 0;
}

export interface ReservationListItem {
  id: string;
  customerId: string;
  customerName: string;
  status: Enums<"reservation_status">;
  origin: string | null;
  expiresAt: string | null;
  total: number;
  createdAt: string;
}

export async function listReservations(
  context: TenantContext,
  params: { status?: string; customerId?: string; page: number },
): Promise<{ rows: ReservationListItem[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("reservations")
    .select(
      "id, customer_id, status, origin, expires_at, created_at, customer:customers(name), items:reservation_items(quantity, unit_price)",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenant.id);

  if (params.status) query = query.eq("status", params.status as Enums<"reservation_status">);
  if (params.customerId) query = query.eq("customer_id", params.customerId);

  const from = (params.page - 1) * RESERVATION_PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + RESERVATION_PAGE_SIZE - 1);
  if (error) throw new Error(`listReservations failed: ${error.code}`);

  return {
    total: count ?? 0,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer?.name ?? "",
      status: row.status,
      origin: row.origin,
      expiresAt: row.expires_at,
      total: (row.items ?? []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0),
      createdAt: row.created_at,
    })),
  };
}

export interface ReservationItemRow {
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
}

export interface ReservationDetail extends ReservationListItem {
  notes: string | null;
  canceledReason: string | null;
  completedSaleId: string | null;
  responsibleName: string | null;
  items: ReservationItemRow[];
}

export async function getReservationDetail(context: TenantContext, id: string): Promise<ReservationDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservations")
    .select(
      `id, customer_id, status, origin, expires_at, notes, canceled_reason, completed_sale_id, created_at,
       customer:customers(name),
       responsible:profiles!reservations_responsible_user_id_fkey(full_name),
       items:reservation_items(variant_id, quantity, unit_price,
         variant:product_variants(name, product:products(name)))`,
    )
    .eq("tenant_id", context.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const items = (data.items ?? []).map((item) => ({
    variantId: item.variant_id,
    productName: item.variant?.product.name ?? "",
    variantName: item.variant?.name ?? "",
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
  }));

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customer?.name ?? "",
    status: data.status,
    origin: data.origin,
    expiresAt: data.expires_at,
    notes: data.notes,
    canceledReason: data.canceled_reason,
    completedSaleId: data.completed_sale_id,
    responsibleName: data.responsible?.full_name ?? null,
    createdAt: data.created_at,
    total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    items,
  };
}

export async function listReservationsByCustomer(
  context: TenantContext,
  customerId: string,
): Promise<ReservationListItem[]> {
  const { rows } = await listReservations(context, { customerId, page: 1 });
  return rows;
}
