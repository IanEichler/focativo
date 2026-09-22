import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIToolResult } from "./provider";
import type { Database } from "@/types/database.types";

type AdminClient = SupabaseClient<Database>;

interface SearchResult {
  variant_id: string;
  product_name: string;
  variant_name: string;
  current_price: number;
  available_quantity: number;
}

/** Executa uma tool chamada pela IA — sempre contra RPCs próprias da IA, nunca as de staff (ver a migration da Fase 7). */
export async function executeTool(
  admin: AdminClient,
  context: { tenantId: string; conversationId: string },
  toolUseId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<AIToolResult> {
  try {
    switch (name) {
      case "buscar_produtos":
        return { toolUseId, content: JSON.stringify(await searchProducts(admin, context.tenantId, input)) };
      case "criar_reserva":
        return { toolUseId, content: JSON.stringify(await createReservation(admin, context.conversationId, input)) };
      case "escalar_para_humano":
        return { toolUseId, content: JSON.stringify(await escalate(admin, context.conversationId, input)) };
      case "consultar_servicos":
        return { toolUseId, content: JSON.stringify(await listAgendaServices(admin, context.tenantId)) };
      case "consultar_profissionais":
        return { toolUseId, content: JSON.stringify(await listProfessionals(admin, context.tenantId)) };
      case "criar_agendamento":
        return { toolUseId, content: JSON.stringify(await bookAppointment(admin, context.conversationId, input)) };
      default:
        return { toolUseId, content: `tool desconhecida: ${name}`, isError: true };
    }
  } catch (error) {
    return { toolUseId, content: error instanceof Error ? error.message : String(error), isError: true };
  }
}

async function searchProducts(
  admin: AdminClient,
  tenantId: string,
  input: Record<string, unknown>,
): Promise<SearchResult[]> {
  const { data, error } = await admin.rpc("catalog_search_variants", {
    p_tenant_id: tenantId,
    p_query: typeof input.consulta === "string" ? input.consulta : undefined,
    p_in_stock_only: input.apenas_em_estoque === true,
    p_limit: 5,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    variant_id: row.variant_id,
    product_name: row.product_name,
    variant_name: row.variant_name,
    current_price: Number(row.current_price),
    available_quantity: Number(row.available_quantity),
  }));
}

async function createReservation(admin: AdminClient, conversationId: string, input: Record<string, unknown>) {
  const itens = Array.isArray(input.itens) ? input.itens : [];
  const items = itens
    .filter((item): item is { variant_id: string; quantidade: number } => typeof item?.variant_id === "string")
    .map((item) => ({ variant_id: item.variant_id, quantity: Number(item.quantidade) }));
  if (items.length === 0) throw new Error("nenhum item informado");

  const { data, error } = await admin.rpc("ai_reservation_create", {
    p_conversation_id: conversationId,
    p_items: items,
    p_notes: typeof input.observacoes === "string" ? input.observacoes : undefined,
  });
  if (error) throw new Error(error.message);
  return { reservation_id: data };
}

async function escalate(admin: AdminClient, conversationId: string, input: Record<string, unknown>) {
  const { error } = await admin.rpc("ai_escalate_conversation", {
    p_conversation_id: conversationId,
    p_reason: typeof input.motivo === "string" ? input.motivo : undefined,
  });
  if (error) throw new Error(error.message);
  return { escalated: true };
}

async function listAgendaServices(admin: AdminClient, tenantId: string) {
  const { data, error } = await admin
    .from("agenda_services")
    .select("id, name, description, duration_minutes, price")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    service_id: row.id,
    name: row.name,
    description: row.description,
    duration_minutes: row.duration_minutes,
    price: Number(row.price),
  }));
}

async function listProfessionals(admin: AdminClient, tenantId: string) {
  const { data, error } = await admin
    .from("tenant_users")
    .select("user_id, profile:profiles!tenant_users_user_id_fkey(full_name)")
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    professional_user_id: row.user_id,
    name: row.profile?.full_name || "Profissional",
  }));
}

async function bookAppointment(admin: AdminClient, conversationId: string, input: Record<string, unknown>) {
  if (
    typeof input.service_id !== "string" ||
    typeof input.professional_user_id !== "string" ||
    typeof input.data_hora !== "string"
  ) {
    throw new Error("dados incompletos para o agendamento");
  }
  const startsAt = new Date(input.data_hora);
  if (Number.isNaN(startsAt.getTime())) throw new Error("data_hora inválida");

  const { data, error } = await admin.rpc("ai_agenda_book", {
    p_conversation_id: conversationId,
    p_service_id: input.service_id,
    p_professional_user_id: input.professional_user_id,
    p_starts_at: startsAt.toISOString(),
    p_notes: typeof input.observacoes === "string" ? input.observacoes : undefined,
  });
  if (error) throw new Error(error.message);
  return { appointment_id: data };
}
