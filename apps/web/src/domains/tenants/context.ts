import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { getCurrentUser, getVerifiedIdentity, isSuperAdmin, type CurrentUser } from "@/domains/auth/session";
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
  const identity = await getVerifiedIdentity();
  if (!identity) return null;
  const preferred = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
  const preferredId = uuid.safeParse(preferred).success ? preferred : undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_app_context", { p_preferred_tenant: preferredId });
  if (error) throw new Error(`get_my_app_context failed: ${error.code}`);
  if (!data) return null;
  const snapshot = data as unknown as {
    memberships: (TenantSummary & { membershipId: string })[];
    activeId: string;
    profile: {
      fullName: string | null;
      email: string | null;
      avatarUrl: string | null;
      navOrder: string[] | null;
    } | null;
    permissions: string[];
    disabledModules: string[];
  };
  const active = snapshot.memberships.find((membership) => membership.id === snapshot.activeId);
  if (!active) return null;
  const user: CurrentUser = {
    id: identity.id,
    email: snapshot.profile?.email ?? identity.email,
    fullName: snapshot.profile?.fullName ?? "",
    avatarUrl: snapshot.profile?.avatarUrl ?? null,
    navOrder: snapshot.profile?.navOrder ?? null,
  };
  const permissions: ReadonlySet<string> = new Set(snapshot.permissions ?? []);
  const disabledModules = new Set(snapshot.disabledModules);

  return {
    user,
    tenant: active,
    membershipId: active.membershipId,
    permissions,
    memberships: snapshot.memberships,
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
  const context = await getTenantContext();
  if (!context) {
    if (!(await getCurrentUser())) redirect(ROUTES.login);
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
