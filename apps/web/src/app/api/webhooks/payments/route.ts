import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/webhook-signature";

/**
 * Recebe confirmações/falhas de pagamento (seção 46: webhooks obrigatoriamente
 * idempotentes). Sem sessão de usuário — a autorização é a assinatura HMAC,
 * validada aqui; a chamada às RPCs usa o service role (proxy.ts já exclui
 * /api/webhooks do redirecionamento de autenticação, de propósito).
 *
 * payment_confirm/payment_fail já são idempotentes por status (repetir sobre
 * uma cobrança já CONFIRMED/FAILED é no-op), então reentregas do provider
 * nunca duplicam venda, pagamento ou movimentação de estoque.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");

  let secret: string;
  try {
    secret = getServerEnv().PAYMENT_WEBHOOK_SECRET;
  } catch {
    logger.error({ event: "webhook.payments", status: "error", code: "missing_secret" });
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logger.warn({ event: "webhook.payments", status: "denied", code: "invalid_signature" });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: { provider?: string; event?: string; paymentId?: string; reason?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { event, paymentId } = payload;
  if (!paymentId || (event !== "confirmed" && event !== "failed")) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } =
    event === "confirmed"
      ? await admin.rpc("payment_confirm", { p_payment_id: paymentId })
      : await admin.rpc("payment_fail", {
          p_payment_id: paymentId,
          p_reason: payload.reason ?? "Recusado pelo provedor",
        });

  if (error) {
    logger.warn({ event: "webhook.payments", status: "error", code: error.message, payment_id: paymentId });
    // not_found/invalid_input são erros do payload do webhook, não do servidor.
    const clientError = error.message === "not_found" || error.message === "invalid_input";
    return NextResponse.json({ error: error.message }, { status: clientError ? 422 : 500 });
  }

  logger.info({ event: "webhook.payments", status: "ok", payment_id: paymentId, webhook_event: event });
  return NextResponse.json({ ok: true });
}
