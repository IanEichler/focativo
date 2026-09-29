"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import { sessionAgendaError } from "@/domains/documents/session-plan";
import type { ActionState } from "@/lib/errors";

export async function retryContractSessionAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("agenda.write") || !context.hasModule("agenda")) return { status: "error", message: "Sem permissão para agendar." };
  const id = String(form.get("sessionId") ?? "");
  if (!z.uuid().safeParse(id).success) return { status: "error", message: "Sessão inválida." };
  const date = String(form.get("date") ?? ""), time = String(form.get("time") ?? "");
  const serviceId = String(form.get("serviceId") ?? ""), professionalId = String(form.get("professionalId") ?? "");
  const adjust = form.get("adjust") === "true";
  if (adjust && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !z.uuid().safeParse(serviceId).success || !z.uuid().safeParse(professionalId).success)) {
    return { status: "error", message: "Preencha data, horário, serviço e profissional para ajustar a sessão." };
  }
  const client = await createClient();
  const { data, error } = await client.rpc("contract_session_retry", {
    p_session_id: id, ...(adjust ? { p_changes: { date, time, serviceId, professionalId } } : {}),
  });
  if (error) return { status: "error", message: sessionAgendaError(error.message) };
  if (!data) {
    const pending = await client.from("contract_session_appointments").select("error_code").eq("id", id).eq("tenant_id", context.tenant.id).maybeSingle();
    return { status: "error", message: sessionAgendaError(pending.data?.error_code) };
  }
  revalidatePath("/app/agenda");
  revalidatePath("/app/clientes", "layout");
  return { status: "success", message: "Sessão registrada na agenda." };
}
