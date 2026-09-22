"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { reservationSchema, type ReservationField } from "./schemas";

const RESERVATIONS_PATH = "/app/reservas";

function forbidden(): ActionState<ReservationField> {
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

function revalidate(customerId?: string, reservationId?: string) {
  revalidatePath(RESERVATIONS_PATH);
  revalidatePath("/app/estoque");
  if (customerId) revalidatePath(`/app/clientes/${customerId}`);
  if (reservationId) revalidatePath(`${RESERVATIONS_PATH}/${reservationId}`);
}

export async function createReservationAction(
  _prev: ActionState<ReservationField>,
  formData: FormData,
): Promise<ActionState<ReservationField>> {
  const context = await requireTenantContext();
  if (!context.can("reservations.write")) return forbidden();

  const input = formDataToObject(formData);
  const parsed = reservationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  const { data: reservationId, error } = await supabase.rpc("reservation_create", {
    p_tenant_id: context.tenant.id,
    p_customer_id: data.customerId,
    p_items: data.items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    p_expires_at: data.expiresAt ?? undefined,
    p_origin: data.origin ?? undefined,
    p_notes: data.notes ?? undefined,
  });

  if (error || !reservationId) {
    logger.warn({ event: "reservation.create", status: "error", tenant_id: context.tenant.id, code: error?.message });
    return {
      status: "error",
      message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }),
      values: safeFormValues(input),
    };
  }
  logger.info({ event: "reservation.create", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidate(data.customerId);
  return { status: "success", message: "Reserva criada.", id: reservationId };
}

export async function advanceReservationAction(
  reservationId: string,
  status: "CONFIRMED" | "AWAITING_PICKUP",
  customerId: string,
): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("reservations.write") || !z.uuid().safeParse(reservationId).success)
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reservation_advance", { p_reservation_id: reservationId, p_status: status });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidate(customerId, reservationId);
  return { status: "success" };
}

export async function cancelReservationAction(
  reservationId: string,
  customerId: string,
  reason?: string,
): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("reservations.write") || !z.uuid().safeParse(reservationId).success)
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reservation_cancel", { p_reservation_id: reservationId, p_reason: reason });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidate(customerId, reservationId);
  return { status: "success", message: "Reserva cancelada e estoque liberado." };
}

export async function completeReservationAction(
  reservationId: string,
  customerId: string,
  payment: { paymentMethod?: string; paidAmount?: number },
): Promise<{ status: "success"; message: string; id: string } | { status: "error"; message: string }> {
  const context = await requireTenantContext();
  if (!context.can("reservations.write") || !z.uuid().safeParse(reservationId).success)
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const supabase = await createClient();
  const { data: saleId, error } = await supabase.rpc("reservation_complete", {
    p_reservation_id: reservationId,
    p_payment_method: payment.paymentMethod,
    p_paid_amount: payment.paidAmount,
  });
  if (error || !saleId)
    return { status: "error", message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }) };
  revalidate(customerId, reservationId);
  revalidatePath("/app/vendas");
  return { status: "success", message: "Reserva convertida em venda.", id: saleId };
}
