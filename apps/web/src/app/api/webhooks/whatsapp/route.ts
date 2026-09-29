import { NextResponse } from "next/server";
import { contactPhone } from "@/domains/whatsapp/contact-identity";
import { runAiTurn } from "@/domains/ai/agent";
import { getServerEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/webhook-signature";
import type { TablesInsert } from "@/types/database.types";

/**
 * Recebe eventos do serviço WhatsApp (services/whatsapp) ou, em
 * desenvolvimento sem o serviço real, da simulação do provider DEV — o
 * pipeline (assinatura HMAC, rota HTTP, service role) roda de verdade nos
 * dois casos. Sem sessão de usuário: `proxy.ts` já exclui `/api/webhooks/*`
 * do redirecionamento de autenticação, de propósito (seção 33 — o app
 * principal não deve depender do estado da sessão do WhatsApp).
 *
 * whatsapp_receive_message já é idempotente por external_message_id: uma
 * reentrega do serviço nunca duplica a mensagem nem o contador de não lidas.
 */
interface WhatsAppWebhookPayload {
  event?: "qr" | "ready" | "disconnected" | "auth_failure" | "message" | "chat_id_resolved";
  tenantId?: string;
  qrCode?: string;
  phoneNumber?: string;
  reason?: string;
  whatsappNumber?: string | null;
  profilePicUrl?: string;
  whatsappChatId?: string;
  content?: string;
  externalMessageId?: string;
  senderName?: string;
  mediaPath?: string;
  mediaType?: string;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");

  const secret = getServerEnv().WHATSAPP_SERVICE_SECRET;
  if (!secret) {
    logger.error({ event: "webhook.whatsapp", status: "error", code: "missing_secret" });
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logger.warn({ event: "webhook.whatsapp", status: "denied", code: "invalid_signature" });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { event, tenantId } = payload;
  if (!event || !tenantId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (event === "message") {
    // Segunda camada contra mensagem de grupo (a primeira é o serviço de
    // WhatsApp, que já nem deveria mandar isso) — nunca confiar só na origem.
    if (payload.whatsappChatId?.endsWith("@g.us")) {
      logger.info({ event: "webhook.whatsapp", status: "ignored_group", tenant_id: tenantId });
      return NextResponse.json({ ok: true });
    }

    const phone = contactPhone(payload.whatsappNumber, payload.whatsappChatId);
    if (!phone && !/^\d+@(?:lid|c\.us)$/.test(payload.whatsappChatId ?? "")) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    // whatsapp_receive_message é idempotente por external_message_id (uma
    // reentrega do serviço devolve o id da mensagem já existente) — mas isso
    // por si só não bloqueia um SEGUNDO turno de IA na mesma reentrega, já que
    // a RPC não distingue "criou agora" de "já existia" no retorno. Checa
    // antes, então, para nunca responder duas vezes à mesma mensagem.
    const alreadyExisted = payload.externalMessageId
      ? Boolean(
          (
            await admin
              .from("messages")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("external_message_id", payload.externalMessageId)
              .maybeSingle()
          ).data,
        )
      : false;

    const { data: messageId, error } = await admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: phone,
      p_content: payload.content ?? undefined,
      p_external_message_id: payload.externalMessageId ?? undefined,
      p_sender_name: payload.senderName ?? undefined,
      p_media_path: payload.mediaPath ?? undefined,
      p_media_type: payload.mediaType ?? undefined,
      p_whatsapp_chat_id: payload.whatsappChatId ?? undefined,
    });
    if (error) {
      logger.warn({ event: "webhook.whatsapp", status: "error", code: error.message, tenant_id: tenantId });
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (payload.profilePicUrl && payload.whatsappChatId) {
      const { error: photoError } = await admin
        .from("customers")
        .update({ avatar_url: payload.profilePicUrl })
        .eq("tenant_id", tenantId)
        .eq("whatsapp_chat_id", payload.whatsappChatId)
        .is("archived_at", null);
      if (photoError) logger.warn({ event: "whatsapp.avatar_refresh", status: "error", code: photoError.code });
    }
    logger.info({ event: "webhook.whatsapp", status: "ok", tenant_id: tenantId, webhook_event: event });

    // Fire-and-forget: nunca atrasa a resposta 200 ao serviço de WhatsApp por
    // causa da latência de um LLM. runAiTurn confere sozinha se a conversa
    // está AI_ACTIVE e se o tenant tem a IA ligada antes de fazer qualquer coisa.
    if (messageId && !alreadyExisted) {
      void triggerAiTurn(admin, messageId).catch((aiError: unknown) => {
        logger.warn({ event: "ai.turn", status: "error", tenant_id: tenantId, code: String(aiError) });
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (event === "chat_id_resolved") {
    const phone = contactPhone(payload.whatsappNumber, payload.whatsappChatId);
    if (!payload.whatsappChatId || !phone) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    const { error } = await admin.rpc("whatsapp_correct_number", {
      p_tenant_id: tenantId,
      p_whatsapp_chat_id: payload.whatsappChatId,
      p_whatsapp_number: phone,
    });
    if (error) {
      logger.warn({ event: "webhook.whatsapp", status: "error", code: error.message, tenant_id: tenantId });
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  }

  // qr / ready / disconnected / auth_failure: só refletem o status da sessão.
  const update: TablesInsert<"whatsapp_accounts"> = { tenant_id: tenantId };
  if (event === "qr") {
    update.status = "WAITING_QR";
    update.qr_code = payload.qrCode ?? null;
    update.error_message = null;
  } else if (event === "ready") {
    update.status = "CONNECTED";
    update.phone_number = payload.phoneNumber ?? null;
    update.qr_code = null;
    update.error_message = null;
    update.connected_at = new Date().toISOString();
    update.last_activity_at = new Date().toISOString();
  } else if (event === "disconnected") {
    update.status = "DISCONNECTED";
    update.qr_code = null;
  } else if (event === "auth_failure") {
    update.status = "ERROR";
    update.error_message = payload.reason ?? "Falha de autenticação";
  }

  const { error } = await admin.from("whatsapp_accounts").upsert(update, { onConflict: "tenant_id" });
  if (error) {
    logger.warn({ event: "webhook.whatsapp", status: "error", code: error.message, tenant_id: tenantId });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ event: "webhook.whatsapp", status: "ok", tenant_id: tenantId, webhook_event: event });
  return NextResponse.json({ ok: true });
}

async function triggerAiTurn(admin: ReturnType<typeof createAdminClient>, messageId: string): Promise<void> {
  const { data: message } = await admin.from("messages").select("conversation_id").eq("id", messageId).single();
  if (message?.conversation_id) await runAiTurn(message.conversation_id);
}
