import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Constants, type Enums } from "@/types/database.types";
import { requireSuperAdmin } from "./guard";

const overviewSchema = z.object({
  tenants: z.object({
    total: z.number(),
    active: z.number(),
    suspended: z.number(),
    canceled: z.number(),
    new_this_month: z.number(),
  }),
  users: z.object({
    total: z.number(),
    new_this_month: z.number(),
    active_memberships: z.number(),
    pending_invitations: z.number(),
  }),
  generated_at: z.string(),
});

export type PlatformOverview = z.infer<typeof overviewSchema>;

export async function getPlatformOverview(): Promise<PlatformOverview> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_platform_overview");
  if (error) throw new Error(`admin_platform_overview failed: ${error.message}`);
  return overviewSchema.parse(data);
}

export const tenantStatusSchema = z.enum(Constants.public.Enums.tenant_status);

export interface AdminTenantRow {
  id: string;
  name: string;
  slug: string;
  status: Enums<"tenant_status">;
  segment: string;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  activeUsers: number;
  lastActivityAt: string | null;
}

export interface AdminTenantList {
  rows: AdminTenantRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const ADMIN_PAGE_SIZE = 25;

export async function listAdminTenants(params: {
  search?: string;
  status?: Enums<"tenant_status">;
  page?: number;
}): Promise<AdminTenantList> {
  await requireSuperAdmin();
  const page = Math.max(1, params.page ?? 1);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_tenants", {
    p_search: params.search || undefined,
    p_status: params.status,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_list_tenants failed: ${error.message}`);

  const rows = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    segment: row.segment,
    createdAt: row.created_at,
    ownerName: row.owner_name || null,
    ownerEmail: row.owner_email || null,
    activeUsers: Number(row.active_users),
    lastActivityAt: row.last_activity_at,
  }));

  return { rows, total: Number(data?.[0]?.total_count ?? 0), page, pageSize: ADMIN_PAGE_SIZE };
}

export interface AdminTenantDetail {
  tenant: {
    id: string;
    name: string;
    slug: string;
    legalName: string | null;
    document: string | null;
    email: string | null;
    phone: string | null;
    segment: string;
    timezone: string;
    status: Enums<"tenant_status">;
    createdAt: string;
  };
  members: {
    membershipId: string;
    userId: string;
    name: string;
    email: string | null;
    roleName: string;
    status: Enums<"membership_status">;
  }[];
  platformEvents: {
    id: string;
    action: string;
    reason: string | null;
    before: unknown;
    after: unknown;
    createdAt: string;
  }[];
}

export async function getAdminTenantDetail(tenantId: string): Promise<AdminTenantDetail | null> {
  await requireSuperAdmin();
  if (!z.uuid().safeParse(tenantId).success) return null;
  const supabase = await createClient();

  const [tenantResult, membersResult, eventsResult] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, slug, legal_name, document, email, phone, segment, timezone, status, created_at")
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("tenant_users")
      .select(
        "id, user_id, status, role:roles!inner(name, rank), profile:profiles!tenant_users_user_id_fkey(full_name, email)",
      )
      .eq("tenant_id", tenantId),
    supabase
      .from("platform_audit_logs")
      .select("id, action, reason, before, after, created_at")
      .eq("target_tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const tenant = tenantResult.data;
  if (!tenant) return null;

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      legalName: tenant.legal_name,
      document: tenant.document,
      email: tenant.email,
      phone: tenant.phone,
      segment: tenant.segment,
      timezone: tenant.timezone,
      status: tenant.status,
      createdAt: tenant.created_at,
    },
    members: (membersResult.data ?? [])
      .sort((a, b) => b.role.rank - a.role.rank)
      .map((member) => ({
        membershipId: member.id,
        userId: member.user_id,
        name: member.profile?.full_name || member.profile?.email || "Usuário",
        email: member.profile?.email ?? null,
        roleName: member.role.name,
        status: member.status,
      })),
    platformEvents: (eventsResult.data ?? []).map((event) => ({
      id: event.id,
      action: event.action,
      reason: event.reason,
      before: event.before,
      after: event.after,
      createdAt: event.created_at,
    })),
  };
}

/** Módulos desligados para o tenant (ausência = habilitado — ver a migration). */
export async function getDisabledModules(tenantId: string): Promise<Set<string>> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_module_flags", { p_tenant_id: tenantId });
  if (error) throw new Error(`admin_list_module_flags failed: ${error.message}`);
  return new Set((data ?? []).filter((row) => !row.enabled).map((row) => row.module_code));
}

export interface AiPlatformLimits {
  model: string;
  maxTokensPerReply: number;
  monthlyBudgetCents: number | null;
}

export async function getAiPlatformLimits(tenantId: string): Promise<AiPlatformLimits> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_ai_platform_limits_get", { p_tenant_id: tenantId });
  if (error) throw new Error(`admin_ai_platform_limits_get failed: ${error.message}`);
  const row = data?.[0];
  if (!row) throw new Error("admin_ai_platform_limits_get failed: empty response");
  return {
    model: row.model,
    maxTokensPerReply: row.max_tokens_per_reply,
    monthlyBudgetCents: row.monthly_budget_cents,
  };
}
