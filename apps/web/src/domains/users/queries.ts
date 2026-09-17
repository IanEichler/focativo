import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import type { RoleCode } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

export interface TenantMemberDTO {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string | null;
  roleCode: RoleCode;
  roleName: string;
  roleRank: number;
  status: Enums<"membership_status">;
  joinedAt: string | null;
  invitedAt: string | null;
  isCurrentUser: boolean;
}

export interface AssignableRoleDTO {
  code: RoleCode;
  name: string;
  description: string;
}

export async function listTenantMembers(context: TenantContext): Promise<TenantMemberDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .select(
      "id, user_id, role_code, status, joined_at, invited_at, profile:profiles!tenant_users_user_id_fkey(full_name, email), role:roles!inner(name, rank)",
    )
    .eq("tenant_id", context.tenant.id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listTenantMembers failed: ${error.code}`);

  return (data ?? [])
    .map((row) => ({
      membershipId: row.id,
      userId: row.user_id,
      fullName: row.profile?.full_name || row.profile?.email || "Usuário",
      email: row.profile?.email ?? null,
      roleCode: row.role_code as RoleCode,
      roleName: row.role.name,
      roleRank: row.role.rank,
      status: row.status,
      joinedAt: row.joined_at,
      invitedAt: row.invited_at,
      isCurrentUser: row.user_id === context.user.id,
    }))
    .sort((a, b) => b.roleRank - a.roleRank || a.fullName.localeCompare(b.fullName, "pt-BR"));
}

export async function listAssignableRoles(context: TenantContext): Promise<AssignableRoleDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_assignable_roles", { p_tenant_id: context.tenant.id });
  if (error) return [];
  return (data ?? []).map((role) => ({
    code: role.code as RoleCode,
    name: role.name,
    description: role.description,
  }));
}
