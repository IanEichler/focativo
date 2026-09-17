import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";
import type { TenantContext } from "./context";

export interface InvitationDTO {
  tenantId: string;
  tenantName: string;
  roleName: string;
  invitedBy: string | null;
  invitedAt: string | null;
}

export async function listMyInvitations(): Promise<InvitationDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_invitations");
  if (error) return [];
  return (data ?? []).map((row) => ({
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    roleName: row.role_name,
    invitedBy: row.invited_by_name,
    invitedAt: row.invited_at,
  }));
}

export interface TenantDetailsDTO {
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
}

export async function getTenantDetails(context: TenantContext): Promise<TenantDetailsDTO> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, legal_name, document, email, phone, segment, timezone, status, created_at")
    .eq("id", context.tenant.id)
    .single();
  if (error || !data) throw new Error(`getTenantDetails failed: ${error?.code}`);
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    legalName: data.legal_name,
    document: data.document,
    email: data.email,
    phone: data.phone,
    segment: data.segment,
    timezone: data.timezone,
    status: data.status,
    createdAt: data.created_at,
  };
}

export interface TeamSummaryDTO {
  active: number;
  invited: number;
}

export async function getTeamSummary(context: TenantContext): Promise<TeamSummaryDTO> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_users").select("status").eq("tenant_id", context.tenant.id);
  const rows = data ?? [];
  return {
    active: rows.filter((row) => row.status === "ACTIVE").length,
    invited: rows.filter((row) => row.status === "INVITED").length,
  };
}

export interface SetupProgressDTO {
  productCount: number;
  stockedItemCount: number;
}

/** Contagens usadas no progresso de configuração (respeitam o RLS do usuário). */
export async function getSetupProgress(context: TenantContext): Promise<SetupProgressDTO> {
  const supabase = await createClient();
  const [products, stocked] = await Promise.all([
    context.can("catalog.read")
      ? supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", context.tenant.id)
          .is("archived_at", null)
      : Promise.resolve({ count: 0 }),
    context.can("inventory.read")
      ? supabase
          .from("stock_levels")
          .select("variant_id", { count: "exact", head: true })
          .eq("tenant_id", context.tenant.id)
          .gt("physical_quantity", 0)
      : Promise.resolve({ count: 0 }),
  ]);
  return { productCount: products.count ?? 0, stockedItemCount: stocked.count ?? 0 };
}
