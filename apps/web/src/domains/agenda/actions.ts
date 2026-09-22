"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import type { Enums } from "@/types/database.types";
import { appointmentSchema, serviceSchema, type AppointmentField, type ServiceField } from "./schemas";

const AGENDA_PATH = "/app/agenda";

function forbidden<T extends string>(): ActionState<T> {
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

export async function saveServiceAction(
  _prev: ActionState<ServiceField>,
  formData: FormData,
): Promise<ActionState<ServiceField>> {
  const context = await requireTenantContext();
  if (!context.can("agenda.write")) return forbidden();

  const input = formDataToObject(formData);
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  let serviceId = data.id;
  const { data: createdId, error } = data.id
    ? await supabase.rpc("agenda_service_update", {
        p_service_id: data.id,
        p_name: data.name,
        p_duration_minutes: data.durationMinutes,
        p_price: data.price,
        p_description: data.description ?? undefined,
        p_is_active: data.isActive,
      })
    : await supabase.rpc("agenda_service_create", {
        p_tenant_id: context.tenant.id,
        p_name: data.name,
        p_duration_minutes: data.durationMinutes,
        p_price: data.price,
        p_description: data.description ?? undefined,
      });

  if (error) {
    logger.warn({ event: "agenda.service_save", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  serviceId ??= createdId ?? undefined;

  if (serviceId) {
    const { error: professionalsError } = await supabase.rpc("agenda_service_set_professionals", {
      p_service_id: serviceId,
      p_professional_user_ids: data.professionalUserIds,
    });
    if (professionalsError) {
      logger.warn({
        event: "agenda.service_professionals",
        status: "error",
        tenant_id: context.tenant.id,
        code: professionalsError.message,
      });
      return { status: "error", message: toUserMessage(professionalsError), values: safeFormValues(input) };
    }
  }

  revalidatePath(`${AGENDA_PATH}/servicos`);
  return { status: "success", message: data.id ? "Serviço atualizado." : "Serviço criado." };
}

export async function createAppointmentAction(
  _prev: ActionState<AppointmentField>,
  formData: FormData,
): Promise<ActionState<AppointmentField>> {
  const context = await requireTenantContext();
  if (!context.can("agenda.write")) return forbidden();

  const input = formDataToObject(formData);
  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const startsAt = new Date(data.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return { status: "error", message: "Data e horário inválidos.", values: safeFormValues(input) };
  }

  const supabase = await createClient();
  const { data: appointmentId, error } = await supabase.rpc("agenda_appointment_create", {
    p_tenant_id: context.tenant.id,
    p_customer_id: data.customerId,
    p_service_id: data.serviceId,
    p_professional_user_id: data.professionalUserId,
    p_starts_at: startsAt.toISOString(),
    p_notes: data.notes ?? undefined,
  });

  if (error || !appointmentId) {
    logger.warn({
      event: "agenda.appointment_create",
      status: "error",
      tenant_id: context.tenant.id,
      code: error?.message,
    });
    return {
      status: "error",
      message: toUserMessage(error ?? { message: "forbidden" }),
      values: safeFormValues(input),
    };
  }

  revalidatePath(AGENDA_PATH);
  return { status: "success", message: "Agendamento criado." };
}

export async function advanceAppointmentAction(
  appointmentId: string,
  status: Enums<"appointment_status">,
): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("agenda.write") || !z.uuid().safeParse(appointmentId).success) return forbidden();

  const supabase = await createClient();
  const { error } = await supabase.rpc("agenda_appointment_advance", {
    p_appointment_id: appointmentId,
    p_status: status,
  });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidatePath(AGENDA_PATH);
  return { status: "success" };
}

export async function cancelAppointmentAction(appointmentId: string, reason?: string): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("agenda.write") || !z.uuid().safeParse(appointmentId).success) return forbidden();

  const supabase = await createClient();
  const { error } = await supabase.rpc("agenda_appointment_cancel", {
    p_appointment_id: appointmentId,
    p_reason: reason,
  });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidatePath(AGENDA_PATH);
  return { status: "success", message: "Agendamento cancelado." };
}
