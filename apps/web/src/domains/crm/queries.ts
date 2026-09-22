import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";

export interface StageOption {
  id: string;
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
}

export async function listStages(context: TenantContext): Promise<StageOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_stages")
    .select("id, code, name, color, sort_order, is_won, is_lost")
    .eq("tenant_id", context.tenant.id)
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    isWon: row.is_won,
    isLost: row.is_lost,
  }));
}

export interface OpportunityCard {
  id: string;
  stageId: string;
  customerId: string;
  customerName: string;
  title: string | null;
  estimatedValue: number | null;
  origin: string | null;
  updatedAt: string;
}

/** Quadro do CRM: oportunidades abertas (etapas não finais entram sempre; ganhas/perdidas só recentes). */
export async function listBoard(context: TenantContext): Promise<OpportunityCard[]> {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data } = await supabase
    .from("crm_opportunities")
    .select(
      "id, stage_id, customer_id, title, estimated_value, origin, updated_at, customer:customers!inner(name), stage:crm_stages!inner(is_won, is_lost)",
    )
    .eq("tenant_id", context.tenant.id)
    .order("updated_at", { ascending: false });

  return (data ?? [])
    .filter((row) => (!row.stage.is_won && !row.stage.is_lost) || row.updated_at >= since.toISOString())
    .map((row) => ({
      id: row.id,
      stageId: row.stage_id,
      customerId: row.customer_id,
      customerName: row.customer.name,
      title: row.title,
      estimatedValue: row.estimated_value !== null ? Number(row.estimated_value) : null,
      origin: row.origin,
      updatedAt: row.updated_at,
    }));
}

export interface OpportunityDetail extends OpportunityCard {
  responsibleUserId: string | null;
  notes: string | null;
  expectedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  createdAt: string;
  products: { variantId: string; productName: string; variantName: string; quantity: number }[];
}

export async function getOpportunityDetail(context: TenantContext, id: string): Promise<OpportunityDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_opportunities")
    .select(
      `id, stage_id, customer_id, title, estimated_value, origin, responsible_user_id, notes, expected_at,
       won_at, lost_at, lost_reason, created_at, updated_at,
       customer:customers!inner(name),
       products:crm_opportunity_products(quantity, variant:product_variants(id, name, product:products(name)))`,
    )
    .eq("tenant_id", context.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    stageId: data.stage_id,
    customerId: data.customer_id,
    customerName: data.customer.name,
    title: data.title,
    estimatedValue: data.estimated_value !== null ? Number(data.estimated_value) : null,
    origin: data.origin,
    responsibleUserId: data.responsible_user_id,
    notes: data.notes,
    expectedAt: data.expected_at,
    wonAt: data.won_at,
    lostAt: data.lost_at,
    lostReason: data.lost_reason,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    products: (data.products ?? []).map((p) => ({
      variantId: p.variant!.id,
      productName: p.variant!.product.name,
      variantName: p.variant!.name,
      quantity: Number(p.quantity),
    })),
  };
}

export async function listOpportunitiesByCustomer(
  context: TenantContext,
  customerId: string,
): Promise<OpportunityCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_opportunities")
    .select("id, stage_id, customer_id, title, estimated_value, origin, updated_at, customer:customers!inner(name)")
    .eq("tenant_id", context.tenant.id)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    stageId: row.stage_id,
    customerId: row.customer_id,
    customerName: row.customer.name,
    title: row.title,
    estimatedValue: row.estimated_value !== null ? Number(row.estimated_value) : null,
    origin: row.origin,
    updatedAt: row.updated_at,
  }));
}
