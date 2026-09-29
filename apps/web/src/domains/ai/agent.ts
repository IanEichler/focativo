import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAIProvider } from "./get-provider";
import { estimateCostUsd } from "./pricing";
import { buildSystemPrompt, buildConversationHistory, splitIntoMessages, buildCalendarContext } from "./conversation";
import type { AIContentBlock, AIMessage } from "./provider";
import { buildAiTools } from "./tools";
import { executeTool } from "./tool-executor";
import { getWhatsAppProvider } from "@/domains/whatsapp/get-provider";
import { replyPauseMs, startTypingPresence } from "./reply-delivery";
import { createTurnQueue } from "./turn-queue";
import { claimsCompletedBooking } from "./booking-claims";

const MAX_TOOL_ITERATIONS = 6;
const HISTORY_LIMIT = 40;
const queueTurn = createTurnQueue();

/**
 * Um "turno" da IA: dispara depois que `whatsapp_receive_message` grava uma
 * mensagem numa conversa AI_ACTIVE. Roda fire-and-forget a partir do webhook
 * (nunca bloqueia a resposta HTTP ao serviço de WhatsApp) — se falhar, loga e
 * a conversa simplesmente não recebe resposta automática dessa vez; o cliente
 * pode escrever de novo ou um humano pode assumir pelo Inbox.
 */
export async function runAiTurn(conversationId: string): Promise<void> {
  return queueTurn(conversationId, (isCurrent) => runCurrentTurn(conversationId, isCurrent));
}

async function runCurrentTurn(conversationId: string, isCurrent: () => boolean): Promise<void> {
  const admin = createAdminClient();

  const { data: conversation } = await admin
    .from("conversations")
    .select("tenant_id, customer_id, status, ai_session_started_at")
    .eq("id", conversationId)
    .single();
  if (!conversation || conversation.status !== "AI_ACTIVE") return;

  const [{ data: settings }, { data: limits }, { data: businessInfo }, { data: moduleFlagRows }, { data: tenant }] =
    await Promise.all([
      admin
        .from("tenant_ai_settings")
        .select("enabled, system_prompt")
        .eq("tenant_id", conversation.tenant_id)
        .maybeSingle(),
      // Modelo, limite de tokens e orçamento são decisão do admin master, não
      // do tenant — tabela separada, nunca lida pelo dono da empresa.
      admin
        .from("tenant_ai_platform_limits")
        .select("provider, model, max_tokens_per_reply, monthly_budget_cents")
        .eq("tenant_id", conversation.tenant_id)
        .maybeSingle(),
      admin
        .from("tenant_ai_business_info")
        .select("business_description, general_policies, screening_flow")
        .eq("tenant_id", conversation.tenant_id)
        .maybeSingle(),
      admin.from("tenant_module_flags").select("module_code, enabled").eq("tenant_id", conversation.tenant_id),
      admin.from("tenants").select("name, timezone").eq("id", conversation.tenant_id).single(),
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

  const system = buildSystemPrompt({
    customInstructions: settings.system_prompt,
    businessContext: [tenant?.name ? `Nome da empresa: ${tenant.name}.` : null, buildBusinessInfoBlock(businessInfo)]
      .filter(Boolean)
      .join("\n\n"),
    customerContext: await buildCustomerContext(admin, conversation.customer_id),
    calendarContext: buildCalendarContext(new Date(), tenant?.timezone || "America/Sao_Paulo"),
  });
  const model = limits?.model || "claude-sonnet-5";
  const maxTokens = limits?.max_tokens_per_reply || 1024;
  const tools = buildAiTools({ catalog: !disabledModules.has("catalog"), agenda: !disabledModules.has("agenda") });

  const messages = await loadHistory(admin, conversationId, conversation.ai_session_started_at);
  const provider = getAIProvider(limits?.provider ?? "anthropic");

  const { data: recipient } = await admin
    .from("customers")
    .select("whatsapp, whatsapp_chat_id")
    .eq("id", conversation.customer_id)
    .eq("tenant_id", conversation.tenant_id)
    .single();
  const whatsapp = getWhatsAppProvider();
  async function canContinue() {
    if (!isCurrent()) return false;
    const { data } = await admin
      .from("conversations")
      .select("status, ai_session_started_at")
      .eq("id", conversationId)
      .single();
    return (
      isCurrent() && data?.status === "AI_ACTIVE" && data.ai_session_started_at === conversation!.ai_session_started_at
    );
  }
  if (!(await canContinue())) return;
  // The keyword simulator is only suitable for the simulated WhatsApp transport.
  // Missing credentials must never turn real customer replies into catalog searches.
  if (provider.isDev && !whatsapp.isDev) {
    const { error } = await admin.rpc("ai_escalate_conversation", {
      p_conversation_id: conversationId,
      p_reason:
        "Atendimento automático indisponível: a chave do provedor de IA não está configurada. Configure a integração antes de devolver a conversa à IA.",
    });
    logger.warn({
      event: "ai.credentials_missing",
      tenant_id: conversation.tenant_id,
      conversation_id: conversationId,
      escalated: !error,
    });
    return;
  }
  const typing = await startTypingPresence(async (active) => {
    // Persist genuine work for the inbox independently of WhatsApp presence delivery.
    let query = admin
      .from("conversations")
      .update({
        ai_typing_until: active ? new Date(Date.now() + 20000).toISOString() : null,
      })
      .eq("id", conversationId)
      .eq("status", "AI_ACTIVE");
    query = conversation.ai_session_started_at
      ? query.eq("ai_session_started_at", conversation.ai_session_started_at)
      : query.is("ai_session_started_at", null);
    const results = await Promise.allSettled([
      query.then(({ error }) => {
        if (error) throw new Error("typing_state_write_failed");
      }),
      recipient?.whatsapp || recipient?.whatsapp_chat_id
        ? whatsapp.setTyping(conversation.tenant_id, recipient.whatsapp ?? "", active, recipient.whatsapp_chat_id)
        : Promise.resolve(),
    ]);
    results.forEach((result, index) => {
      if (result.status === "rejected")
        logger.warn({
          event: "ai.typing_failed",
          conversation_id: conversationId,
          destination: index === 0 ? "inbox" : "whatsapp",
        });
    });
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  try {
    let finalText: string | null = null;
    let needsBookingProof = false;

    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        if (!(await canContinue())) return;
        const result = await chatWithRetry(provider, {
          system: needsBookingProof
            ? `${system}\nVERIFICAÇÃO: nenhum agendamento foi criado nesta rodada. Não escreva que ficou marcado ou confirmado. Consulte consultar_disponibilidade e, se o cliente já autorizou a vaga válida, execute criar_agendamento. Caso contrário ofereça vagas válidas e aguarde a escolha.`
            : system,
          messages,
          tools,
          model,
          maxTokens,
        });
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        if (result.stopReason !== "tool_use") {
          finalText = textFrom(result.content);
          if (
            tools.some((tool) => tool.name === "criar_agendamento") &&
            finalText &&
            claimsCompletedBooking(finalText)
          ) {
            needsBookingProof = true;
            finalText = "O agendamento ainda não foi concluído. Precisamos escolher um horário disponível na agenda.";
            continue;
          }
          break;
        }

        messages.push({ role: "assistant", content: result.content });
        const toolUses = result.content.filter(
          (block): block is Extract<AIContentBlock, { type: "tool_use" }> => block.type === "tool_use",
        );
        if (!(await canContinue())) return;
        const results = await Promise.all(
          toolUses.map((toolUse) => {
            const firstBooking = toolUses.find((tool) => tool.name === "criar_agendamento");
            if (
              firstBooking &&
              (toolUse.name === "escalar_para_humano" ||
                (toolUse.name === "criar_agendamento" && toolUse.id !== firstBooking.id))
            ) {
              return Promise.resolve({
                toolUseId: toolUse.id,
                isError: true,
                content:
                  "Conclua apenas um agendamento confirmado por vez. Não transfira o mesmo pedido enquanto cria o agendamento.",
              });
            }
            if (!tools.some((tool) => tool.name === toolUse.name)) {
              return Promise.resolve({
                toolUseId: toolUse.id,
                isError: true,
                content:
                  "Esta ferramenta não está habilitada para esta empresa. Use apenas as ferramentas disponíveis e o contexto da conversa.",
              });
            }
            return executeTool(
              admin,
              { tenantId: conversation.tenant_id, conversationId },
              toolUse.id,
              toolUse.name,
              toolUse.input,
            );
          }),
        );
        messages.push({ role: "user_tool_results", results });

        const booked = results.find(
          (result, index) =>
            !result.isError &&
            toolUses[index]?.name === "criar_agendamento" &&
            JSON.parse(result.content).appointment_id,
        );
        if (booked) {
          const receipt = JSON.parse(booked.content);
          finalText = receipt.confirmation_text || "Seu agendamento foi realizado.";
          break;
        }

        const handoff = results.find((result, index) => {
          if (result.isError || !["criar_agendamento", "escalar_para_humano"].includes(toolUses[index]!.name))
            return false;
          try {
            const outcome = JSON.parse(result.content);
            return outcome.pending_human_confirmation === true || outcome.escalated === true;
          } catch {
            return false;
          }
        });
        await admin.rpc("ai_upsert_conversation_state", {
          p_conversation_id: conversationId,
          p_turn_count: iteration + 1,
          p_last_tool_used: toolUses[0]?.name,
        });
        if (handoff) {
          // A successful handoff changes the status before the next model iteration.
          // Acknowledge once, without letting the model continue running as a human.
          const { data: latest } = await admin
            .from("conversations")
            .select("status, responsible_user_id, ai_session_started_at")
            .eq("id", conversationId)
            .single();
          if (
            isCurrent() &&
            latest?.status === "HUMAN_ACTIVE" &&
            !latest.responsible_user_id &&
            latest.ai_session_started_at === conversation.ai_session_started_at
          ) {
            const pending = JSON.parse(handoff.content).pending_human_confirmation === true;
            await sendReply(
              admin,
              conversation.tenant_id,
              conversationId,
              pending
                ? "Encaminhei seu pedido à equipe, que vai confirmar o horário por aqui. O agendamento ainda não está confirmado."
                : "Encaminhei a conversa à equipe para continuar seu atendimento por aqui.",
            );
          }
          return;
        }
      }
    } catch (providerError) {
      // Provedor de IA falhou mesmo depois da retentativa (rate limit, indisponibilidade
      // temporária etc.) — nunca deixa o cliente sem resposta nenhuma: escala pra um
      // atendente em vez de silêncio (mesmo tratamento já usado pro orçamento estourado).
      logger.warn({
        event: "ai.provider_failed",
        tenant_id: conversation.tenant_id,
        conversation_id: conversationId,
        code: String(providerError),
      });
      if (!(await canContinue())) return;
      await admin.rpc("ai_escalate_conversation", {
        p_conversation_id: conversationId,
        p_reason: "A IA teve uma falha técnica temporária.",
      });
      return;
    }

    if (!finalText) return;
    // Send each idea separately and stop if the customer adds context or a human takes over.
    const chunks = splitIntoMessages(finalText);
    for (let i = 0; i < chunks.length; i++) {
      if (!(await canContinue())) break;
      await typing.pulse();
      if (i > 0) await sleep(replyPauseMs(chunks[i]!));
      if (!(await canContinue())) break;
      if (!(await sendReply(admin, conversation.tenant_id, conversationId, chunks[i]!))) break;
    }
  } finally {
    await typing.stop();
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
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    return false;
  }

  const { data: conversation } = await admin
    .from("conversations")
    .select("customer:customers(whatsapp, whatsapp_chat_id)")
    .eq("id", conversationId)
    .single();
  const to = conversation?.customer?.whatsapp;
  const chatId = conversation?.customer?.whatsapp_chat_id;
  if (!to && !chatId) {
    await admin.rpc("message_mark_failed", { p_message_id: messageId, p_reason: "Cliente sem WhatsApp cadastrado" });
    return false;
  }

  try {
    const provider = getWhatsAppProvider();
    // Sem o chat_id salvo no recebimento, o envio cai no fallback de endereçar
    // só pelo telefone (resolveChatId em services/whatsapp), que falha com
    // "No LID for user" pra contatos migrados pro "@lid" — mesmo problema já
    // resolvido pro envio manual do atendente (domains/whatsapp/actions.ts),
    // só faltava aplicar aqui também.
    const sent = await provider.sendText(tenantId, to ?? "", text, chatId);
    await admin.rpc("message_mark_sent", { p_message_id: messageId, p_external_message_id: sent.externalMessageId });
    return true;
  } catch (sendError) {
    logger.warn({ event: "ai.provider_send", status: "error", tenant_id: tenantId, code: String(sendError) });
    await admin.rpc("message_mark_failed", { p_message_id: messageId, p_reason: "Falha ao enviar pelo WhatsApp" });
    return false;
  }
}

async function loadHistory(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  startedAt: string | null,
): Promise<AIMessage[]> {
  let query = admin
    .from("messages")
    .select("direction, content, media_type, status")
    .eq("conversation_id", conversationId)
    .or("direction.eq.INBOUND,status.in.(SENT,DELIVERED,READ)")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (startedAt) query = query.gte("created_at", startedAt);
  const { data } = await query;

  return buildConversationHistory((data ?? []).reverse());
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

/**
 * Bloco compacto e sempre presente no prompt (o modelo precisa disso desde a
 * primeira mensagem — saudação, ordem de triagem — não dá pra esperar um
 * tool-call). FAQ fica de fora de propósito: vira a tool consultar_perguntas_frequentes,
 * sob demanda, pra não inflar todo turno com pergunta que talvez nunca seja feita.
 */
function buildBusinessInfoBlock(
  info: { business_description: string | null; general_policies: string | null; screening_flow: unknown } | null,
): string | null {
  if (!info) return null;
  const flow = Array.isArray(info.screening_flow) ? (info.screening_flow as string[]) : [];
  const parts: string[] = [];
  if (info.business_description) parts.push(`Sobre o negócio: ${info.business_description}`);
  if (info.general_policies) parts.push(`Políticas gerais: ${info.general_policies}`);
  if (flow.length > 0) {
    parts.push(
      `Ordem sugerida de atendimento (oriente-se por ela, sem ser rígida):\n${flow.map((step, i) => `${i + 1}. ${step}`).join("\n")}`,
    );
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Uma retentativa rápida antes de desistir — cobre falhas passageiras do provedor
 *  (ex.: Gemini 503 "high demand") sem escalar pra humano à toa. */
async function chatWithRetry(
  provider: ReturnType<typeof getAIProvider>,
  params: Parameters<ReturnType<typeof getAIProvider>["chat"]>[0],
) {
  try {
    return await provider.chat(params);
  } catch (error) {
    logger.warn({ event: "ai.provider_retry", code: String(error) });
    await new Promise((resolve) => setTimeout(resolve, 800));
    return provider.chat(params);
  }
}

function textFrom(content: AIContentBlock[]): string | null {
  const text = content
    .filter((block): block is Extract<AIContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || null;
}
