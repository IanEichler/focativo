"use server";

import { randomUUID } from "node:crypto";
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
import { getWhatsAppProvider } from "./get-provider";
import {
  sendMessageSchema,
  simulateIncomingMessageSchema,
  type SendMessageField,
  type SimulateIncomingMessageField,
} from "./schemas";

type SimpleResult = { status: "success"; message?: string } | { status: "error"; message: string };

function revalidateInbox(conversationId?: string) {
  revalidatePath("/app/atendimento");
  if (conversationId) revalidatePath(`/app/atendimento/${conversationId}`);
}

async function postWebhookEvent(payload: Record<string, unknown>): Promise<SimpleResult> {
  const { WHATSAPP_SERVICE_SECRET } = getServerEnv();
  if (!WHATSAPP_SERVICE_SECRET) return { status: "error", message: "WHATSAPP_SERVICE_SECRET não configurado." };
  const { NEXT_PUBLIC_APP_URL } = getPublicEnv();
  const body = JSON.stringify(payload);
  const signature = signWebhookBody(body, WHATSAPP_SERVICE_SECRET);

  try {
    const response = await fetch(`${NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-signature": signature },
      body,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { status: "error", message: toUserMessage({ message: data.error }) };
    }
    return { status: "success" };
  } catch (fetchError) {
    return { status: "error", message: `Não foi possível alcançar o webhook: ${String(fetchError)}` };
  }
}

/** Inicia a conexão: pede o QR ao provider e, no DEV, já simula o evento via webhook real. */
export async function connectWhatsAppAction(): Promise<SimpleResult> {
  const context = await requireTenantContext();
  if (!context.can("tenant.update")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const provider = getWhatsAppProvider();
  await provider.requestConnection(context.tenant.id);

  if (provider.isDev) {
    const result = await postWebhookEvent({
      event: "qr",
      tenantId: context.tenant.id,
      qrCode: `DEV-QR-${randomUUID()}`,
    });
    if (result.status === "error") return result;
  }

  revalidatePath("/app/whatsapp");
  return { status: "success", message: "Solicitação de conexão enviada." };
}

export async function disconnectWhatsAppAction(): Promise<SimpleResult> {
  const context = await requireTenantContext();
  if (!context.can("tenant.update")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const provider = getWhatsAppProvider();
  await provider.disconnect(context.tenant.id);

  if (provider.isDev) {
    const result = await postWebhookEvent({ event: "disconnected", tenantId: context.tenant.id });
    if (result.status === "error") return result;
  }

  revalidatePath("/app/whatsapp");
  return { status: "success", message: "WhatsApp desconectado." };
}

/** Ferramenta de DESENVOLVIMENTO: simula o cliente escaneando o QR (sem celular real). */
export async function simulateWhatsAppScanAction(): Promise<SimpleResult> {
  const context = await requireTenantContext();
  if (!context.can("tenant.update")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  const provider = getWhatsAppProvider();
  if (!provider.isDev) return { status: "error", message: "Disponível só com o provider de desenvolvimento." };

  const result = await postWebhookEvent({
    event: "ready",
    tenantId: context.tenant.id,
    phoneNumber: "5511900000000",
  });
  if (result.status === "success") revalidatePath("/app/whatsapp");
  return result;
}

/** Ferramenta de DESENVOLVIMENTO: simula uma mensagem chegando de um cliente. */
export async function simulateIncomingMessageAction(
  _prev: ActionState<SimulateIncomingMessageField>,
  formData: FormData,
): Promise<ActionState<SimulateIncomingMessageField>> {
  const context = await requireTenantContext();
  if (!context.can("whatsapp.read")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  const provider = getWhatsAppProvider();
  if (!provider.isDev) return { status: "error", message: "Disponível só com o provider de desenvolvimento." };

  const input = formDataToObject(formData);
  const parsed = simulateIncomingMessageSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const result = await postWebhookEvent({
    event: "message",
    tenantId: context.tenant.id,
    whatsappNumber: parsed.data.whatsappNumber,
    content: parsed.data.content,
    senderName: parsed.data.senderName,
    externalMessageId: `dev_in_${randomUUID()}`,
  });
  if (result.status === "error") return result;
  revalidateInbox();
  return { status: "success", message: "Mensagem simulada recebida." };
}

export async function sendMessageAction(
  _prev: ActionState<SendMessageField>,
  formData: FormData,
): Promise<ActionState<SendMessageField>> {
  const context = await requireTenantContext();
  if (!context.can("whatsapp.write")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const input = formDataToObject(formData);
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const { conversationId, content } = parsed.data;

  const supabase = await createClient();
  const { data: messageId, error } = await supabase.rpc("message_send", {
    p_conversation_id: conversationId,
    p_content: content,
  });
  if (error || !messageId) {
    logger.warn({
      event: "whatsapp.message_send",
      status: "error",
      tenant_id: context.tenant.id,
      code: error?.message,
    });
    return { status: "error", message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }) };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("customer:customers(whatsapp, whatsapp_chat_id)")
    .eq("id", conversationId)
    .single();
  const to = conversation?.customer?.whatsapp;
  const chatId = conversation?.customer?.whatsapp_chat_id;

  if (!to) {
    await supabase.rpc("message_mark_failed", { p_message_id: messageId, p_reason: "Cliente sem WhatsApp cadastrado" });
  } else {
    try {
      const provider = getWhatsAppProvider();
      const sent = await provider.sendText(context.tenant.id, to, content, chatId);
      await supabase.rpc("message_mark_sent", {
        p_message_id: messageId,
        p_external_message_id: sent.externalMessageId,
      });
    } catch (sendError) {
      logger.warn({
        event: "whatsapp.provider_send",
        status: "error",
        tenant_id: context.tenant.id,
        code: String(sendError),
      });
      await supabase.rpc("message_mark_failed", { p_message_id: messageId, p_reason: "Falha ao enviar pelo WhatsApp" });
    }
  }

  revalidateInbox(conversationId);
  return { status: "success", message: undefined };
}

type ConversationRpc =
  | "conversation_assume"
  | "conversation_return_to_ai"
  | "conversation_pause"
  | "conversation_close"
  | "conversation_mark_read";

async function transition(
  rpc: ConversationRpc,
  permission: "whatsapp.read" | "whatsapp.write",
  conversationId: string,
): Promise<SimpleResult> {
  const context = await requireTenantContext();
  if (!context.can(permission) || !z.uuid().safeParse(conversationId).success) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_conversation_id: conversationId });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidateInbox(conversationId);
  return { status: "success" };
}

export async function assumeConversationAction(conversationId: string) {
  return transition("conversation_assume", "whatsapp.write", conversationId);
}
export async function returnToAiAction(conversationId: string) {
  return transition("conversation_return_to_ai", "whatsapp.write", conversationId);
}
export async function pauseConversationAction(conversationId: string) {
  return transition("conversation_pause", "whatsapp.write", conversationId);
}
export async function closeConversationAction(conversationId: string) {
  return transition("conversation_close", "whatsapp.write", conversationId);
}
export async function markReadAction(conversationId: string) {
  return transition("conversation_mark_read", "whatsapp.read", conversationId);
}

/** Busca a foto de perfil no WhatsApp e guarda no cliente (só quando ainda não tem uma salva). */
export async function refreshCustomerAvatarAction(customerId: string): Promise<SimpleResult> {
  const context = await requireTenantContext();
  if (!context.can("whatsapp.read") || !z.uuid().safeParse(customerId).success) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("whatsapp, whatsapp_chat_id, avatar_url")
    .eq("id", customerId)
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();
  if (!customer?.whatsapp || customer.avatar_url) return { status: "success" };

  try {
    const provider = getWhatsAppProvider();
    const contact = await provider.getContact(context.tenant.id, customer.whatsapp, customer.whatsapp_chat_id);
    if (!contact?.profilePicUrl) return { status: "success" };

    await supabase
      .from("customers")
      .update({ avatar_url: contact.profilePicUrl })
      .eq("id", customerId)
      .eq("tenant_id", context.tenant.id);
    revalidateInbox();
  } catch (error) {
    logger.warn({
      event: "whatsapp.avatar_refresh",
      status: "error",
      tenant_id: context.tenant.id,
      code: String(error),
    });
  }
  return { status: "success" };
}
