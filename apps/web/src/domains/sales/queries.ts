import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

export const SALE_PAGE_SIZE = 30;

export interface SaleListItem {
  id: string;
  customerId: string | null;
  customerName: string | null;
  origin: Enums<"sale_origin">;
  total: number;
  paymentMethod: string | null;
  canceledAt: string | null;
  createdAt: string;
}

export async function listSales(
  context: TenantContext,
  params: { customerId?: string; canceled?: boolean; page: number },
): Promise<{ rows: SaleListItem[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select("id, customer_id, origin, total, payment_method, canceled_at, created_at, customer:customers(name)", {
      count: "exact",
    })
    .eq("tenant_id", context.tenant.id);

  if (params.customerId) query = query.eq("customer_id", params.customerId);
  query = params.canceled ? query.not("canceled_at", "is", null) : query.is("canceled_at", null);

  const from = (params.page - 1) * SALE_PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + SALE_PAGE_SIZE - 1);
  if (error) throw new Error(`listSales failed: ${error.code}`);

  return {
    total: count ?? 0,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer?.name ?? null,
      origin: row.origin,
      total: Number(row.total),
      paymentMethod: row.payment_method,
      canceledAt: row.canceled_at,
      createdAt: row.created_at,
    })),
  };
}

export interface SaleItemRow {
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  lineTotal: number;
}

export interface SaleDetail extends SaleListItem {
  subtotal: number;
  discountAmount: number;
  paidAmount: number | null;
  notes: string | null;
  reservationId: string | null;
  canceledReason: string | null;
  responsibleName: string | null;
  items: SaleItemRow[];
}

export async function getSaleDetail(context: TenantContext, id: string): Promise<SaleDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales")
    .select(
      `id, customer_id, origin, subtotal, discount_amount, total, payment_method, paid_amount, notes,
       reservation_id, canceled_at, canceled_reason, created_at,
       customer:customers(name),
       responsible:profiles!sales_responsible_user_id_fkey(full_name),
       items:sale_items(variant_id, quantity, unit_price, unit_cost, line_total,
         variant:product_variants(name, product:products(name)))`,
    )
    .eq("tenant_id", context.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customer?.name ?? null,
    origin: data.origin,
    subtotal: Number(data.subtotal),
    discountAmount: Number(data.discount_amount),
    total: Number(data.total),
    paymentMethod: data.payment_method,
    paidAmount: data.paid_amount !== null ? Number(data.paid_amount) : null,
    notes: data.notes,
    reservationId: data.reservation_id,
    canceledAt: data.canceled_at,
    canceledReason: data.canceled_reason,
    responsibleName: data.responsible?.full_name ?? null,
    createdAt: data.created_at,
    items: (data.items ?? []).map((item) => ({
      variantId: item.variant_id,
      productName: item.variant?.product.name ?? "",
      variantName: item.variant?.name ?? "",
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      unitCost: item.unit_cost !== null ? Number(item.unit_cost) : null,
      lineTotal: Number(item.line_total),
    })),
  };
}

export async function listSalesByCustomer(context: TenantContext, customerId: string): Promise<SaleListItem[]> {
  const { rows } = await listSales(context, { customerId, page: 1 });
  return rows;
}
