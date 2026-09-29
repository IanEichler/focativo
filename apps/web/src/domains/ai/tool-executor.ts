import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIToolResult } from "./provider";
import type { Database } from "@/types/database.types";
import { z } from "zod";
import { appointmentServiceLabel, EVALUATION_PREFIX } from "@/domains/agenda/attendance";

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
      case "consultar_horario_atendimento":
        return { toolUseId, content: JSON.stringify(await listBusinessHours(admin, context.tenantId)) };
      case "consultar_disponibilidade": {
        const parsed = z
          .object({ service_id: z.uuid(), data: z.iso.date(), professional_user_id: z.uuid().optional() })
          .parse(input);
        const { data, error } = await admin.rpc("ai_agenda_availability", {
          p_conversation_id: context.conversationId,
          p_service_id: parsed.service_id,
          p_date: parsed.data,
          p_professional_user_id: parsed.professional_user_id,
        });
        if (error) throw new Error(error.message);
        return { toolUseId, content: JSON.stringify(data) };
      }
      case "consultar_perguntas_frequentes":
        return { toolUseId, content: JSON.stringify(await listFaq(admin, context.tenantId)) };
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
    .select("id, name, description, duration_minutes, price, requires_human_confirmation, restrictions")
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
    restrictions: row.restrictions,
    // Quando true, o próximo pedido de agendamento desse serviço volta com
    // pending_human_confirmation — avise o cliente disso com antecedência.
    requires_human_confirmation: row.requires_human_confirmation,
  }));
}

async function listProfessionals(admin: AdminClient, tenantId: string) {
  const { data, error } = await admin
    .from("tenant_users")
    .select("user_id, profile:profiles!tenant_users_user_id_fkey(full_name)")
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => row.profile?.full_name?.trim())
    .map((row) => ({
      professional_user_id: row.user_id,
      name: row.profile!.full_name!.trim(),
    }));
}

const DAY_LABELS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

async function listBusinessHours(admin: AdminClient, tenantId: string) {
  const { data, error } = await admin
    .from("tenant_business_hours")
    .select("day_of_week, opens_at, closes_at, is_closed")
    .eq("tenant_id", tenantId)
    .order("day_of_week");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    dia: DAY_LABELS[row.day_of_week],
    fechado: row.is_closed,
    abre: row.opens_at,
    fecha: row.closes_at,
  }));
}

async function listFaq(admin: AdminClient, tenantId: string) {
  const { data, error } = await admin
    .from("tenant_ai_business_info")
    .select("faq")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.faq ?? [];
}

async function bookAppointment(admin: AdminClient, conversationId: string, input: Record<string, unknown>) {
  const kind = z.enum(["avaliacao", "procedimento"]).default("procedimento").parse(input.tipo_atendimento);
  const rawNotes = typeof input.observacoes === "string" ? input.observacoes.trim() : "";
  const notes = kind === "avaliacao" ? `${EVALUATION_PREFIX} ${rawNotes}`.trim() : rawNotes;
  if (
    typeof input.service_id !== "string" ||
    typeof input.professional_user_id !== "string" ||
    typeof input.data_hora !== "string"
  ) {
    throw new Error("dados incompletos para o agendamento");
  }
  const startsAt = new Date(input.data_hora);
  if (Number.isNaN(startsAt.getTime()) || !/(Z|[+-]\d{2}:\d{2})$/.test(input.data_hora))
    throw new Error(
      "data_hora inválida: use o starts_at exato retornado por consultar_disponibilidade, com fuso horário.",
    );

  const { data, error } = await admin.rpc("ai_agenda_book", {
    p_conversation_id: conversationId,
    p_service_id: input.service_id,
    p_professional_user_id: input.professional_user_id,
    p_starts_at: startsAt.toISOString(),
    p_notes: notes || undefined,
  });
  if (error) {
    // ai_agenda_book só recusa — nunca escreve nada na mesma chamada que
    // falha de propósito (um RAISE não capturado desfaz a transação
    // inteira, inclusive qualquer INSERT feito antes dele). Quem grava o
    // marcador de "pendente" e escala pro humano é este código aqui, em
    // chamadas separadas que de fato commitam.
    if (error.message === "human_confirmation_required") {
      const { error: stateError } = await admin.rpc("ai_upsert_conversation_state", {
        p_conversation_id: conversationId,
        p_turn_count: 0,
        p_draft_items: [
          {
            type: "appointment_pending",
            human_cleared: false,
            service_id: input.service_id,
            professional_user_id: input.professional_user_id,
            starts_at: startsAt.toISOString(),
            notes: typeof input.observacoes === "string" ? input.observacoes : null,
          },
        ],
      });
      if (stateError) throw new Error(stateError.message);
      await escalate(admin, conversationId, {
        motivo: `Pedido de agendamento para ${input.data_hora}, pendente de confirmação humana. Detalhes preservados no estado da conversa. ${typeof input.observacoes === "string" ? input.observacoes : ""}`,
      });
      return { pending_human_confirmation: true };
    }
    const reasons: Record<string, string> = {
      outside_business_hours:
        "Esse horário fica fora do expediente ou não comporta a duração do serviço. Consulte consultar_disponibilidade e ofereça outra vaga; não confirme nem transfira para humano.",
      slot_unavailable:
        "Esse horário já está ocupado. Consulte consultar_disponibilidade novamente e ofereça outra vaga, sem transferir para humano.",
      professional_unavailable:
        "A profissional está indisponível nesse dia. Consulte outra data, preservando as preferências da cliente.",
      hours_not_configured:
        "Os horários de funcionamento ainda não foram cadastrados. Não há vaga autorizada para confirmar.",
      invalid_date: "A data não é válida para agendar. Consulte uma data futura.",
    };
    throw new Error(reasons[error.message] ?? error.message);
  }
  if (!data) throw new Error("O agendamento não foi gravado. Não confirme um horário.");
  const { data: receipt } = await admin
    .from("agenda_appointments")
    .select(
      "starts_at, notes, service:agenda_services(name), professional:profiles!agenda_appointments_professional_user_id_fkey(full_name), tenant:tenants(timezone)",
    )
    .eq("id", data)
    .maybeSingle();
  const when = receipt
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: receipt.tenant?.timezone || "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(receipt.starts_at))
    : null;
  return {
    appointment_id: data,
    confirmation_text: when
      ? `Agendamento confirmado: ${appointmentServiceLabel(receipt!.service?.name ?? "atendimento", receipt!.notes)}, ${when}${receipt!.professional?.full_name ? `, com ${receipt!.professional.full_name}` : ""}.`
      : "Seu agendamento foi realizado.",
  };
}
