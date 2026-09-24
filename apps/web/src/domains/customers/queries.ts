import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { searchNormalize } from "@/lib/codes";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export const CUSTOMER_PAGE_SIZE = 30;

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  tags: string[];
  origin: string | null;
  responsibleName: string | null;
  avatarUrl: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export async function listCustomers(
  context: TenantContext,
  params: { query?: string; origin?: string; archived?: boolean; page: number },
): Promise<{ rows: CustomerListItem[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select(
      "id, name, phone, whatsapp, email, tags, origin, avatar_url, archived_at, created_at, responsible:profiles!customers_responsible_user_id_fkey(full_name)",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenant.id);

  query = params.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (params.origin) query = query.eq("origin", params.origin);
  if (params.query) {
    const pattern = likePattern(searchNormalize(params.query));
    const digits = params.query.replace(/\D/g, "");
    const clauses = [`name.ilike.${pattern}`, `email.ilike.${pattern}`];
    if (digits.length >= 4) {
      clauses.push(`phone.ilike.%${digits}%`, `whatsapp.ilike.%${digits}%`, `document.ilike.%${digits}%`);
    }
    query = query.or(clauses.join(","));
  }

  const from = (params.page - 1) * CUSTOMER_PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + CUSTOMER_PAGE_SIZE - 1);
  if (error) throw new Error(`listCustomers failed: ${error.code}`);

  return {
    total: count ?? 0,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      whatsapp: row.whatsapp,
      email: row.email,
      tags: row.tags ?? [],
      origin: row.origin,
      responsibleName: row.responsible?.full_name ?? null,
      avatarUrl: row.avatar_url,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
    })),
  };
}

export interface CustomerDetail extends CustomerListItem {
  document: string | null;
  birthday: string | null;
  notes: string | null;
  responsibleUserId: string | null;
  totalSpent: number;
  purchaseCount: number;
  averageTicket: number | null;
  lastPurchaseAt: string | null;
}

export async function getCustomerDetail(context: TenantContext, id: string): Promise<CustomerDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, name, phone, whatsapp, email, document, birthday, notes, tags, origin, avatar_url, archived_at, created_at, responsible_user_id, responsible:profiles!customers_responsible_user_id_fkey(full_name)",
    )
    .eq("tenant_id", context.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const { data: stats } = await supabase
    .from("customer_stats")
    .select("total_spent, purchase_count, average_ticket, last_purchase_at")
    .eq("customer_id", id)
    .maybeSingle();

  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    whatsapp: data.whatsapp,
    email: data.email,
    document: data.document,
    birthday: data.birthday,
    notes: data.notes,
    tags: data.tags ?? [],
    origin: data.origin,
    responsibleUserId: data.responsible_user_id,
    responsibleName: data.responsible?.full_name ?? null,
    avatarUrl: data.avatar_url,
    archivedAt: data.archived_at,
    createdAt: data.created_at,
    totalSpent: Number(stats?.total_spent ?? 0),
    purchaseCount: Number(stats?.purchase_count ?? 0),
    averageTicket:
      stats?.average_ticket !== null && stats?.average_ticket !== undefined ? Number(stats.average_ticket) : null,
    lastPurchaseAt: stats?.last_purchase_at ?? null,
  };
}

export interface TimelineEventRow {
  id: string;
  type: string;
  actorType: Enums<"audit_actor_type">;
  actorName: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export async function listCustomerTimeline(context: TenantContext, customerId: string): Promise<TimelineEventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("timeline_events")
    .select("id, type, actor_type, actor_user_id, payload, occurred_at")
    .eq("tenant_id", context.tenant.id)
    .eq("customer_id", customerId)
    .order("occurred_at", { ascending: false })
    .limit(100);

  // actor_user_id não tem FK (o evento precisa sobreviver à remoção do usuário,
  // mesma justificativa de audit_logs), então o nome é buscado à parte.
  const actorIds = [...new Set((data ?? []).map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const profile of profiles ?? []) names.set(profile.id, profile.full_name || profile.email || "Usuário");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    actorType: row.actor_type,
    actorName: row.actor_user_id ? (names.get(row.actor_user_id) ?? "Usuário") : null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    occurredAt: row.occurred_at,
  }));
}

export interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
}

export async function lookupCustomers(context: TenantContext, query: string): Promise<CustomerOption[]> {
  const supabase = await createClient();
  let request = supabase
    .from("customers")
    .select("id, name, phone, whatsapp")
    .eq("tenant_id", context.tenant.id)
    .is("archived_at", null)
    .order("name")
    .limit(20);
  if (query) {
    const pattern = likePattern(searchNormalize(query));
    const digits = query.replace(/\D/g, "");
    const clauses = [`name.ilike.${pattern}`];
    if (digits.length >= 4) {
      clauses.push(`phone.ilike.%${digits}%`, `whatsapp.ilike.%${digits}%`, `document.ilike.%${digits}%`);
    }
    request = request.or(clauses.join(","));
  }
  const { data } = await request;
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, phone: row.phone, whatsapp: row.whatsapp }));
}
