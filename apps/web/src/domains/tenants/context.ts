import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { getCurrentUser, isSuperAdmin, type CurrentUser } from "@/domains/auth/session";
import type { ModuleCode } from "@/lib/modules";
import { hasPermission, type Permission, type RoleCode } from "@/lib/permissions";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

export const ACTIVE_TENANT_COOKIE = "active_tenant";

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: Enums<"tenant_status">;
  segment: string;
  roleCode: RoleCode;
  roleName: string;
}

export interface TenantContext {
  user: CurrentUser;
  tenant: TenantSummary;
  membershipId: string;
  permissions: ReadonlySet<string>;
  memberships: TenantSummary[];
  can: (permission: Permission) => boolean;
  /** Módulo do plano habilitado pelo admin master (default ligado — ausência de registro = habilitado). */
  hasModule: (module: ModuleCode) => boolean;
}

const uuid = z.uuid();

/**
 * Resolve o tenant ativo. O cookie é apenas uma PREFERÊNCIA: a associação é
 * relida do banco (RLS) a cada requisição e um valor forjado é ignorado.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("tenant_users")
    .select("id, role_code, tenant:tenants!inner(id, name, slug, status, segment), role:roles!inner(name, rank)")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true });

  if (error || !rows?.length) return null;

  const memberships = rows.map((row) => ({
    membershipId: row.id,
    summary: {
      id: row.tenant.id,
      name: row.tenant.name,
      slug: row.tenant.slug,
      status: row.tenant.status,
      segment: row.tenant.segment,
      roleCode: row.role_code as RoleCode,
      roleName: row.role.name,
    } satisfies TenantSummary,
  }));

  const preferred = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
  const preferredId = uuid.safeParse(preferred).success ? preferred : undefined;
  const active = memberships.find((m) => m.summary.id === preferredId) ?? memberships[0]!;

  const [{ data: permissionRows }, { data: moduleFlagRows }] = await Promise.all([
    supabase.rpc("get_my_permissions", { p_tenant_id: active.summary.id }),
    supabase.from("tenant_module_flags").select("module_code, enabled").eq("tenant_id", active.summary.id),
  ]);
  const permissions: ReadonlySet<string> = new Set(permissionRows ?? []);
  const disabledModules = new Set((moduleFlagRows ?? []).filter((row) => !row.enabled).map((row) => row.module_code));

  return {
    user,
    tenant: active.summary,
    membershipId: active.membershipId,
    permissions,
    memberships: memberships.map((m) => m.summary),
    can: (permission) => hasPermission(permissions, permission),
    hasModule: (module) => !disabledModules.has(module),
  };
});

/**
 * Exige usuário autenticado com empresa ativa; caso contrário redireciona.
 * Um admin master sem nenhuma empresa (caso comum: a conta existe só para
 * administrar a plataforma) vai para o painel administrativo em vez do
 * onboarding de "crie sua empresa" — ele não é um cliente da plataforma.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const user = await getCurrentUser();
  if (!user) redirect(ROUTES.login);
  const context = await getTenantContext();
  if (!context) {
    if (await isSuperAdmin()) redirect(ROUTES.admin);
    redirect(ROUTES.onboarding);
  }
  return context;
}

export const ACTIVE_TENANT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
