import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";

export interface SalesByDayRow {
  day: string;
  salesCount: number;
  revenue: number;
}

export async function getSalesByDay(context: TenantContext, since: string | null): Promise<SalesByDayRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_sales_by_day", {
    p_tenant_id: context.tenant.id,
    p_since: since ?? undefined,
    p_until: undefined,
  });
  if (error) throw new Error(`getSalesByDay failed: ${error.code}`);
  return (data ?? []).map((row) => ({
    day: row.day,
    salesCount: Number(row.sales_count),
    revenue: Number(row.revenue),
  }));
}

export interface TopProductRow {
  variantId: string;
  productName: string;
  variantName: string;
  quantitySold: number;
  revenue: number;
}

export async function getTopProducts(
  context: TenantContext,
  since: string | null,
  limit = 10,
): Promise<TopProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_top_products", {
    p_tenant_id: context.tenant.id,
    p_since: since ?? undefined,
    p_limit: limit,
  });
  if (error) throw new Error(`getTopProducts failed: ${error.code}`);
  return (data ?? []).map((row) => ({
    variantId: row.variant_id,
    productName: row.product_name,
    variantName: row.variant_name,
    quantitySold: Number(row.quantity_sold),
    revenue: Number(row.revenue),
  }));
}

export interface TopCustomerRow {
  customerId: string;
  customerName: string;
  purchaseCount: number;
  totalSpent: number;
}

export async function getTopCustomers(
  context: TenantContext,
  since: string | null,
  limit = 10,
): Promise<TopCustomerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_top_customers", {
    p_tenant_id: context.tenant.id,
    p_since: since ?? undefined,
    p_limit: limit,
  });
  if (error) throw new Error(`getTopCustomers failed: ${error.code}`);
  return (data ?? []).map((row) => ({
    customerId: row.customer_id,
    customerName: row.customer_name,
    purchaseCount: Number(row.purchase_count),
    totalSpent: Number(row.total_spent),
  }));
}

export interface CrmFunnelRow {
  stageId: string;
  stageName: string;
  stageColor: string;
  opportunityCount: number;
  wonCount: number;
  lostCount: number;
}

export async function getCrmFunnel(context: TenantContext, since: string | null): Promise<CrmFunnelRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_crm_funnel", {
    p_tenant_id: context.tenant.id,
    p_since: since ?? undefined,
  });
  if (error) throw new Error(`getCrmFunnel failed: ${error.code}`);
  return (data ?? []).map((row) => ({
    stageId: row.stage_id,
    stageName: row.stage_name,
    stageColor: row.stage_color,
    opportunityCount: Number(row.opportunity_count),
    wonCount: Number(row.won_count),
    lostCount: Number(row.lost_count),
  }));
}

export interface AgendaSummary {
  appointmentsCount: number;
  completedCount: number;
  noShowCount: number;
  canceledCount: number;
  revenue: number;
}

export async function getAgendaSummary(context: TenantContext, since: string | null): Promise<AgendaSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_agenda_summary", {
    p_tenant_id: context.tenant.id,
    p_since: since ?? undefined,
  });
  if (error) throw new Error(`getAgendaSummary failed: ${error.code}`);
  const row = data?.[0];
  return {
    appointmentsCount: Number(row?.appointments_count ?? 0),
    completedCount: Number(row?.completed_count ?? 0),
    noShowCount: Number(row?.no_show_count ?? 0),
    canceledCount: Number(row?.canceled_count ?? 0),
    revenue: Number(row?.revenue ?? 0),
  };
}
