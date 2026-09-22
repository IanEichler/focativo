import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

export interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  provider: string;
  providerChargeId: string | null;
  status: Enums<"payment_status">;
  failedReason: string | null;
  instructions: { pixCode?: string; paymentUrl?: string } | null;
  createdAt: string;
  confirmedAt: string | null;
}

export async function listReservationPayments(context: TenantContext, reservationId: string): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select(
      "id, amount, method, provider, provider_charge_id, status, failed_reason, metadata, created_at, confirmed_at",
    )
    .eq("tenant_id", context.tenant.id)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    method: row.method,
    provider: row.provider,
    providerChargeId: row.provider_charge_id,
    status: row.status,
    failedReason: row.failed_reason,
    instructions: (row.metadata as { instructions?: PaymentRow["instructions"] })?.instructions ?? null,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  }));
}

export interface FinancialSummary {
  revenue: number;
  received: number;
  pending: number;
  salesCount: number;
  byMethod: Record<string, number>;
}

export async function getFinancialSummary(context: TenantContext, since?: string): Promise<FinancialSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("financial_summary", { p_tenant_id: context.tenant.id, p_since: since ?? undefined })
    .single();
  if (error) throw new Error(`getFinancialSummary failed: ${error.code}`);

  return {
    revenue: Number(data.revenue),
    received: Number(data.received),
    pending: Number(data.pending),
    salesCount: Number(data.sales_count),
    byMethod: Object.fromEntries(
      Object.entries((data.by_method as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Number(v)]),
    ),
  };
}

export interface ReceivableRow {
  saleId: string;
  customerId: string | null;
  customerName: string | null;
  total: number;
  paidAmount: number;
  balance: number;
  createdAt: string;
}

export async function listReceivables(context: TenantContext): Promise<ReceivableRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_receivables", { p_tenant_id: context.tenant.id });
  if (error) throw new Error(`listReceivables failed: ${error.code}`);

  return (data ?? []).map((row) => ({
    saleId: row.sale_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    total: Number(row.total),
    paidAmount: Number(row.paid_amount),
    balance: Number(row.balance),
    createdAt: row.created_at,
  }));
}

export interface PendingChargeRow {
  id: string;
  reservationId: string;
  customerName: string | null;
  amount: number;
  method: string;
  createdAt: string;
}

export async function listPendingCharges(context: TenantContext): Promise<PendingChargeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("id, reservation_id, amount, method, created_at, customer:customers(name)")
    .eq("tenant_id", context.tenant.id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    reservationId: row.reservation_id,
    customerName: row.customer?.name ?? null,
    amount: Number(row.amount),
    method: row.method,
    createdAt: row.created_at,
  }));
}
