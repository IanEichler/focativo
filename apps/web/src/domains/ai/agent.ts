import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAIProvider } from "./get-provider";
import { estimateCostUsd } from "./pricing";
import type { AIContentBlock, AIMessage } from "./provider";
import { buildAiTools } from "./tools";
import { executeTool } from "./tool-executor";
import { getWhatsAppProvider } from "@/domains/whatsapp/get-provider";

const MAX_TOOL_ITERATIONS = 4;
const HISTORY_LIMIT = 20;

const BASE_SYSTEM_PROMPT = `Você é a assistente de atendimento de uma empresa pelo WhatsApp. Seja breve, cordial e direta.
Use as tools disponíveis para consultar dados reais (catálogo, serviços, disponibilidade — nunca invente
produtos, preços, procedimentos ou horários) e só confirme uma reserva ou agendamento depois que o cliente
confirmar exatamente o que quer. Se não tiver certeza do que o cliente precisa, pergunte antes de agir. Se o
cliente pedir para falar com uma pessoa, ou parecer insatisfeito, use a tool de escalonamento em vez de tentar
resolver sozinha.`;

/**
 * Um "turno" da IA: dispara depois que `whatsapp_receive_message` grava uma
 * mensagem numa conversa AI_ACTIVE. Roda fire-and-forget a partir do webhook
 * (nunca bloqueia a resposta HTTP ao serviço de WhatsApp) — se falhar, loga e
 * a conversa simplesmente não recebe resposta automática dessa vez; o cliente
 * pode escrever de novo ou um humano pode assumir pelo Inbox.
 */
export async function runAiTurn(conversationId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: conversation } = await admin
    .from("conversations")
    .select("tenant_id, customer_id, status")
    .eq("id", conversationId)
    .single();
  if (!conversation || conversation.status !== "AI_ACTIVE") return;

  const [{ data: settings }, { data: limits }, { data: moduleFlagRows }] = await Promise.all([
    admin
      .from("tenant_ai_settings")
      .select("enabled, system_prompt")
      .eq("tenant_id", conversation.tenant_id)
      .maybeSingle(),
    // Modelo, limite de tokens e orçamento são decisão do admin master, não
    // do tenant — tabela separada, nunca lida pelo dono da empresa.
    admin
      .from("tenant_ai_platform_limits")
      .select("model, max_tokens_per_reply, monthly_budget_cents")
      .eq("tenant_id", conversation.tenant_id)
      .maybeSingle(),
    admin.from("tenant_module_flags").select("module_code, enabled").eq("tenant_id", conversation.tenant_id),
  ]);
  if (!settings?.enabled) return;
  const disabledModules = new Set((moduleFlagRows ?? []).filter((row) => !row.enabled).map((row) => row.module_code));
  // Módulo "ai" desligado pelo admin master tem a palavra final, mesmo com a
  // IA ligada pelo dono do tenant (mesma trava de private.require_ai_service_call).
  if (disabledModules.has("ai")) return;

  if (limits?.monthly_budget_cents != null) {
    const { data: spent } = await admin.rpc("ai_usage_month_to_date", { p_tenant_id: conversation.tenant_id });
    if (Number(spent ?? 0) >= limits.monthly_budget_cents / 100) {
      await admin.rpc("ai_escalate_conversation", {
        p_conversation_id: conversationId,
        p_reason: "Orçamento mensal de IA atingido.",
      });
      logger.warn({ event: "ai.budget_exceeded", tenant_id: conversation.tenant_id, conversation_id: conversationId });
      return;
    }
  }

  const system = [
    settings.system_prompt || BASE_SYSTEM_PROMPT,
    await buildCustomerContext(admin, conversation.customer_id),
  ].join("\n\n");
  const model = limits?.model || "claude-sonnet-5";
  const maxTokens = limits?.max_tokens_per_reply || 1024;
  const tools = buildAiTools({ catalog: !disabledModules.has("catalog"), agenda: !disabledModules.has("agenda") });

  const messages = await loadHistory(admin, conversationId);
  const provider = getAIProvider();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalText: string | null = null;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await provider.chat({ system, messages, tools, model, maxTokens });
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;

    if (result.stopReason !== "tool_use") {
      finalText = textFrom(result.content);
      break;
    }

    messages.push({ role: "assistant", content: result.content });
    const toolUses = result.content.filter(
      (block): block is Extract<AIContentBlock, { type: "tool_use" }> => block.type === "tool_use",
    );
    const results = await Promise.all(
      toolUses.map((toolUse) =>
        executeTool(
          admin,
          { tenantId: conversation.tenant_id, conversationId },
          toolUse.id,
          toolUse.name,
          toolUse.input,
        ),
      ),
    );
    messages.push({ role: "user_tool_results", results });

    const escalated = toolUses.some((toolUse) => toolUse.name === "escalar_para_humano");
    await admin.rpc("ai_upsert_conversation_state", {
      p_conversation_id: conversationId,
      p_turn_count: iteration + 1,
      p_last_tool_used: toolUses[0]?.name,
    });
    if (escalated) break;
  }

  if (!provider.isDev && (totalInputTokens > 0 || totalOutputTokens > 0)) {
    await admin.rpc("ai_log_usage", {
      p_tenant_id: conversation.tenant_id,
      p_conversation_id: conversationId,
      p_model: model,
      p_input_tokens: totalInputTokens,
      p_output_tokens: totalOutputTokens,
      p_cost_usd: estimateCostUsd(model, totalInputTokens, totalOutputTokens),
    });
  }

  if (!finalText) return;
  await sendReply(admin, conversation.tenant_id, conversationId, finalText);
}

async function sendReply(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  conversationId: string,
  text: string,
) {
  const { data: messageId, error } = await admin.rpc("ai_message_send", {
    p_conversation_id: conversationId,
    p_content: text,
  });
  if (error || !messageId) {
    logger.warn({ event: "ai.message_send", status: "error", tenant_id: tenantId, code: error?.message });
    return;
  }

  const { data: conversation } = await admin
    .from("conversations")
    .select("customer:customers(whatsapp)")
    .eq("id", conversationId)
    .single();
  const to = conversation?.customer?.whatsapp;
  if (!to) {
    await admin.rpc("message_mark_failed", { p_message_id: messageId, p_reason: "Cliente sem WhatsApp cadastrado" });
    return;
  }

  try {
    const provider = getWhatsAppProvider();
    const sent = await provider.sendText(tenantId, to, text);
    await admin.rpc("message_mark_sent", { p_message_id: messageId, p_external_message_id: sent.externalMessageId });
  } catch (sendError) {
    logger.warn({ event: "ai.provider_send", status: "error", tenant_id: tenantId, code: String(sendError) });
    await admin.rpc("message_mark_failed", { p_message_id: messageId, p_reason: "Falha ao enviar pelo WhatsApp" });
  }
}

async function loadHistory(admin: ReturnType<typeof createAdminClient>, conversationId: string): Promise<AIMessage[]> {
  const { data } = await admin
    .from("messages")
    .select("direction, content, media_type")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  return (data ?? [])
    .reverse()
    .filter((row) => row.content)
    .map((row): AIMessage =>
      row.direction === "INBOUND"
        ? { role: "user", content: row.content! }
        : { role: "assistant", content: [{ type: "text", text: row.content! }] },
    );
}

async function buildCustomerContext(admin: ReturnType<typeof createAdminClient>, customerId: string): Promise<string> {
  const { data: customer } = await admin.from("customers").select("name, tags").eq("id", customerId).single();
  const { data: stats } = await admin
    .from("customer_stats")
    .select("total_spent, purchase_count, last_purchase_at")
    .eq("customer_id", customerId)
    .maybeSingle();

  const parts = [`Cliente: ${customer?.name ?? "desconhecido"}.`];
  if (customer?.tags?.length) parts.push(`Tags: ${customer.tags.join(", ")}.`);
  if (stats && Number(stats.purchase_count) > 0) {
    parts.push(`Já comprou ${stats.purchase_count}x, total R$ ${Number(stats.total_spent).toFixed(2)}.`);
  } else {
    parts.push("Ainda não fez nenhuma compra.");
  }
  return `Contexto do cliente:\n${parts.join(" ")}`;
}

function textFrom(content: AIContentBlock[]): string | null {
  const text = content
    .filter((block): block is Extract<AIContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || null;
}
