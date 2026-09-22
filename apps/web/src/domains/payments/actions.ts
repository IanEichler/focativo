"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, validationError } from "@/lib/validation";
import { signWebhookBody } from "@/lib/webhook-signature";
import { getPaymentProvider } from "./providers/dev-provider";
import { createChargeSchema, type CreateChargeField } from "./schemas";

function revalidateReservation(reservationId: string) {
  revalidatePath(`/app/reservas/${reservationId}`);
  revalidatePath("/app/financeiro");
}

/**
 * Cria a cobrança em duas etapas: 1) RPC calcula o valor a partir da reserva e
 * grava a linha PENDING (id gerado pelo banco); 2) só então o provider é
 * chamado (o DEV provider usa o id como parte do charge_id) e o retorno é
 * anexado. Preço nunca vem do cliente, igual às demais operações comerciais.
 */
export async function createChargeAction(
  _prev: ActionState<CreateChargeField>,
  formData: FormData,
): Promise<ActionState<CreateChargeField>> {
  const context = await requireTenantContext();
  if (!context.can("sales.write")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const input = formDataToObject(formData);
  const parsed = createChargeSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const { reservationId, method } = parsed.data;

  const supabase = await createClient();
  const { data: paymentId, error } = await supabase.rpc("payment_create_charge", {
    p_tenant_id: context.tenant.id,
    p_reservation_id: reservationId,
    p_method: method,
  });
  if (error || !paymentId) {
    logger.warn({
      event: "payment.create_charge",
      status: "error",
      tenant_id: context.tenant.id,
      code: error?.message,
    });
    return { status: "error", message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }) };
  }

  const { data: reservation } = await supabase
    .from("reservations")
    .select("customer:customers(name)")
    .eq("id", reservationId)
    .single();
  const { data: payment } = await supabase.from("payments").select("amount").eq("id", paymentId).single();

  const provider = getPaymentProvider("dev");
  const charge = await provider.createCharge({
    paymentId,
    amount: Number(payment?.amount ?? 0),
    method,
    customerName: reservation?.customer?.name ?? "Cliente",
  });

  const { error: attachError } = await supabase.rpc("payment_attach_provider_info", {
    p_payment_id: paymentId,
    p_provider_charge_id: charge.providerChargeId,
    p_metadata: { instructions: charge.instructions ?? {} },
  });
  if (attachError) {
    logger.warn({
      event: "payment.attach_provider",
      status: "error",
      tenant_id: context.tenant.id,
      code: attachError.message,
    });
  }

  logger.info({ event: "payment.create_charge", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidateReservation(reservationId);
  return { status: "success", message: "Cobrança criada. Aguardando confirmação do pagamento.", id: paymentId };
}

type SimpleResult = { status: "success"; message: string } | { status: "error"; message: string };

export async function cancelChargeAction(paymentId: string, reservationId: string): Promise<SimpleResult> {
  const context = await requireTenantContext();
  if (!context.can("sales.write") || !z.uuid().safeParse(paymentId).success) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("payment_cancel", { p_payment_id: paymentId });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidateReservation(reservationId);
  return { status: "success", message: "Cobrança cancelada." };
}

/**
 * Ferramenta de DESENVOLVIMENTO: sem gateway real, não existe quem entregue o
 * webhook de verdade. Em vez de chamar a RPC diretamente, assina e envia uma
 * requisição real para /api/webhooks/payments — exercita o pipeline completo
 * (assinatura HMAC, rota HTTP, service role) exatamente como uma entrega real
 * do provider faria. Claramente marcada como DEV na UI (nunca um mock de tela).
 */
export async function simulatePaymentWebhookAction(
  paymentId: string,
  reservationId: string,
  event: "confirmed" | "failed",
): Promise<SimpleResult> {
  const context = await requireTenantContext();
  if (!context.can("sales.write") || !z.uuid().safeParse(paymentId).success) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }

  const { PAYMENT_WEBHOOK_SECRET } = getServerEnv();
  const { NEXT_PUBLIC_APP_URL } = getPublicEnv();
  const body = JSON.stringify({
    provider: "dev",
    event,
    paymentId,
    reason: event === "failed" ? "Simulado no ambiente de desenvolvimento" : undefined,
  });
  const signature = signWebhookBody(body, PAYMENT_WEBHOOK_SECRET);

  let response: Response;
  try {
    response = await fetch(`${NEXT_PUBLIC_APP_URL}/api/webhooks/payments`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-signature": signature },
      body,
    });
  } catch (fetchError) {
    logger.warn({
      event: "payment.simulate_webhook",
      status: "error",
      tenant_id: context.tenant.id,
      code: String(fetchError),
    });
    return {
      status: "error",
      message: "Não foi possível alcançar o endpoint de webhook. Verifique NEXT_PUBLIC_APP_URL.",
    };
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { status: "error", message: toUserMessage({ message: body.error }) };
  }

  revalidateReservation(reservationId);
  return {
    status: "success",
    message:
      event === "confirmed"
        ? "Pagamento confirmado (simulado): reserva convertida em venda."
        : "Pagamento recusado (simulado).",
  };
}
