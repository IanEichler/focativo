"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import type { Enums } from "@/types/database.types";
import {
  appointmentSchema,
  businessHoursSchema,
  professionalExceptionSchema,
  serviceSchema,
  type AppointmentField,
  type ProfessionalExceptionField,
  type ServiceField,
} from "./schemas";

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
        p_requires_human_confirmation: data.requiresHumanConfirmation,
        p_restrictions: data.restrictions ?? undefined,
      })
    : await supabase.rpc("agenda_service_create", {
        p_tenant_id: context.tenant.id,
        p_name: data.name,
        p_duration_minutes: data.durationMinutes,
        p_price: data.price,
        p_description: data.description ?? undefined,
        p_requires_human_confirmation: data.requiresHumanConfirmation,
        p_restrictions: data.restrictions ?? undefined,
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

export async function saveBusinessHoursAction(hours: unknown): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("agenda.write")) return forbidden();

  const parsed = businessHoursSchema.safeParse(hours);
  if (!parsed.success) return { status: "error", message: "Horários inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("agenda_business_hours_set", {
    p_tenant_id: context.tenant.id,
    p_hours: JSON.stringify(
      parsed.data.map((day) => ({
        day_of_week: day.dayOfWeek,
        opens_at: day.opensAt,
        closes_at: day.closesAt,
        is_closed: day.isClosed,
      })),
    ),
  });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidatePath(`${AGENDA_PATH}/servicos`);
  return { status: "success", message: "Horário de funcionamento salvo." };
}

export async function createProfessionalExceptionAction(
  _prev: ActionState<ProfessionalExceptionField>,
  formData: FormData,
): Promise<ActionState<ProfessionalExceptionField>> {
  const context = await requireTenantContext();
  const input = formDataToObject(formData);
  const parsed = professionalExceptionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("agenda_professional_exception_create", {
    p_tenant_id: context.tenant.id,
    p_professional_user_id: data.professionalUserId,
    p_date: data.date,
    p_reason: data.reason ?? undefined,
  });
  if (error) {
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  revalidatePath(`${AGENDA_PATH}/servicos`);
  return { status: "success", message: "Exceção registrada." };
}

export async function deleteProfessionalExceptionAction(exceptionId: string): Promise<ActionState> {
  await requireTenantContext();
  if (!z.uuid().safeParse(exceptionId).success) return forbidden();

  const supabase = await createClient();
  const { error } = await supabase.rpc("agenda_professional_exception_delete", { p_id: exceptionId });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidatePath(`${AGENDA_PATH}/servicos`);
  return { status: "success", message: "Exceção removida." };
}
