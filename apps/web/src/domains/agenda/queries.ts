import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  /** Vazio = qualquer profissional ativo pode atender (default aberto — ver a migration de elegibilidade). */
  professionalUserIds: string[];
}

export async function listServices(
  context: TenantContext,
  params: { activeOnly?: boolean } = {},
): Promise<ServiceRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("agenda_services")
    .select(
      "id, name, description, duration_minutes, price, is_active, professionals:agenda_service_professionals(professional_user_id)",
    )
    .eq("tenant_id", context.tenant.id);
  if (params.activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new Error(`listServices failed: ${error.code}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    price: Number(row.price),
    isActive: row.is_active,
    professionalUserIds: (row.professionals ?? []).map((p) => p.professional_user_id),
  }));
}

export const APPOINTMENT_PAGE_SIZE = 30;

export interface AppointmentListItem {
  id: string;
  customerId: string;
  customerName: string;
  serviceName: string;
  professionalUserId: string;
  professionalName: string;
  startsAt: string;
  endsAt: string;
  status: Enums<"appointment_status">;
  notes: string | null;
  canceledReason: string | null;
}

export async function listAppointments(
  context: TenantContext,
  params: { status?: string; from?: string; customerId?: string; page: number },
): Promise<{ rows: AppointmentListItem[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("agenda_appointments")
    .select(
      "id, customer_id, professional_user_id, starts_at, ends_at, status, notes, canceled_reason, customer:customers(name), service:agenda_services(name), professional:profiles!agenda_appointments_professional_user_id_fkey(full_name)",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenant.id);

  if (params.status) query = query.eq("status", params.status as Enums<"appointment_status">);
  if (params.from) query = query.gte("starts_at", params.from);
  if (params.customerId) query = query.eq("customer_id", params.customerId);

  const from = (params.page - 1) * APPOINTMENT_PAGE_SIZE;
  const { data, count, error } = await query
    .order("starts_at", { ascending: true })
    .range(from, from + APPOINTMENT_PAGE_SIZE - 1);
  if (error) throw new Error(`listAppointments failed: ${error.code}`);

  return {
    total: count ?? 0,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer?.name ?? "",
      serviceName: row.service?.name ?? "",
      professionalUserId: row.professional_user_id,
      professionalName: row.professional?.full_name || "Profissional",
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      notes: row.notes,
      canceledReason: row.canceled_reason,
    })),
  };
}

export interface TodayAgendaSummary {
  count: number;
  nextStartsAt: string | null;
}

/** Compromissos de hoje ainda em aberto (usado no dashboard). Nunca financeiro: só uma contagem operacional. */
export async function getTodayAgendaSummary(context: TenantContext): Promise<TodayAgendaSummary> {
  const supabase = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, count, error } = await supabase
    .from("agenda_appointments")
    .select("starts_at", { count: "exact" })
    .eq("tenant_id", context.tenant.id)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .in("status", ["SCHEDULED", "CONFIRMED"])
    .order("starts_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`getTodayAgendaSummary failed: ${error.code}`);

  return { count: count ?? 0, nextStartsAt: data?.[0]?.starts_at ?? null };
}

export interface ProfessionalOption {
  userId: string;
  fullName: string;
}
