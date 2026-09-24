import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";

describe("WhatsApp inbox: recebimento, envio e handoff humano", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Gorila Suplementos");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
  });

  it("creates a customer and a conversation on the first message from an unknown number", async () => {
    const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11988887777",
      p_content: "Oi, vocês têm whey de chocolate?",
      p_external_message_id: "wa-msg-1",
      p_sender_name: "João Cliente",
    });
    expect(row!.whatsapp_receive_message).toBeTruthy();

    const [customer] = await db
      .as(ownerId)
      .query<{ id: string; name: string; whatsapp: string; origin: string }>(
        "select id, name, whatsapp, origin from public.customers where tenant_id = $1 and whatsapp = $2",
        [tenantId, "11988887777"],
      );
    expect(customer!.name).toBe("João Cliente");
    expect(customer!.origin).toBe("whatsapp");

    const [conversation] = await db
      .as(ownerId)
      .query<{ status: string; unread_count: number; last_message_preview: string }>(
        "select status, unread_count, last_message_preview from public.conversations where customer_id = $1",
        [customer!.id],
      );
    expect(conversation!.status).toBe("HUMAN_ACTIVE"); // sem IA ainda (Fase 7): nasce para um humano ver
    expect(conversation!.unread_count).toBe(1);
    expect(conversation!.last_message_preview).toBe("Oi, vocês têm whey de chocolate?");
  });

  it("creates a CRM opportunity in the default stage for a brand new WhatsApp customer, but not on their follow-up messages", async () => {
    const [firstRow] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11933332222",
      p_content: "Oi, quero saber mais",
      p_external_message_id: "wa-crm-auto-1",
      p_sender_name: "Nova Lead",
    });
    void firstRow;

    const [customer] = await db.admin.query<{ id: string }>(
      "select id from public.customers where tenant_id = $1 and whatsapp = $2",
      [tenantId, "11933332222"],
    );

    const [defaultStage] = await db.admin.query<{ id: string }>(
      "select id from public.crm_stages where tenant_id = $1 and is_active and not is_won and not is_lost order by sort_order asc limit 1",
      [tenantId],
    );

    const opportunities = await db.admin.query<{ stage_id: string; origin: string }>(
      "select stage_id, origin from public.crm_opportunities where tenant_id = $1 and customer_id = $2",
      [tenantId, customer!.id],
    );
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]!.stage_id).toBe(defaultStage!.id);
    expect(opportunities[0]!.origin).toBe("whatsapp");

    // Segunda mensagem do mesmo cliente: não pode criar uma segunda oportunidade.
    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11933332222",
      p_content: "Oi de novo",
      p_external_message_id: "wa-crm-auto-2",
    });
    const opportunitiesAfter = await db.admin.query(
      "select id from public.crm_opportunities where tenant_id = $1 and customer_id = $2",
      [tenantId, customer!.id],
    );
    expect(opportunitiesAfter).toHaveLength(1);
  });

  it("stores the raw WhatsApp chat id alongside the phone, and backfills it if missing on an existing customer", async () => {
    const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11999998888",
      p_content: "Oi",
      p_external_message_id: "wa-chatid-1",
      p_whatsapp_chat_id: "123456789@lid",
    });
    void row;
    const [customer] = await db.admin.query<{ id: string; whatsapp_chat_id: string | null }>(
      "select id, whatsapp_chat_id from public.customers where tenant_id = $1 and whatsapp = $2",
      [tenantId, "11999998888"],
    );
    expect(customer!.whatsapp_chat_id).toBe("123456789@lid");

    // Um segundo webhook (ex.: reconexão da sessão) traz um chat id novo —
    // backfill/atualização, nunca fica preso ao primeiro valor visto.
    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11999998888",
      p_content: "Oi de novo",
      p_external_message_id: "wa-chatid-2",
      p_whatsapp_chat_id: "987654321@lid",
    });
    const [updated] = await db.admin.query<{ whatsapp_chat_id: string | null }>(
      "select whatsapp_chat_id from public.customers where id = $1",
      [customer!.id],
    );
    expect(updated!.whatsapp_chat_id).toBe("987654321@lid");
  });

  it("matches an existing customer by whatsapp_chat_id even when the resolved number is wrong or unstable, instead of creating a duplicate", async () => {
    const chatId = "555111222@lid";
    const [first] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "30447375491177", // resolução de LID falhou: caiu no fallback (dígitos crus)
      p_content: "Oi",
      p_external_message_id: "wa-dedupe-1",
      p_whatsapp_chat_id: chatId,
    });
    void first;

    // Segunda mensagem do MESMO contato: a lib resolveu certo dessa vez e
    // mandou um número diferente (bom). Não pode criar um segundo cliente —
    // tem que casar pelo chat_id e atualizar o telefone pro valor melhor.
    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "5511977776666",
      p_content: "Oi de novo",
      p_external_message_id: "wa-dedupe-2",
      p_whatsapp_chat_id: chatId,
    });

    const customers = await db.admin.query<{ id: string; whatsapp: string }>(
      "select id, whatsapp from public.customers where tenant_id = $1 and whatsapp_chat_id = $2",
      [tenantId, chatId],
    );
    expect(customers).toHaveLength(1);
    expect(customers[0]!.whatsapp).toBe("5511977776666");

    // Terceira mensagem: resolução falha de novo (número ruim). Não pode
    // degradar o telefone bom que já está salvo.
    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "99988877766655",
      p_content: "Oi de novo de novo",
      p_external_message_id: "wa-dedupe-3",
      p_whatsapp_chat_id: chatId,
    });
    const [stillGood] = await db.admin.query<{ whatsapp: string }>(
      "select whatsapp from public.customers where id = $1",
      [customers[0]!.id],
    );
    expect(stillGood!.whatsapp).toBe("5511977776666");
  });

  it("whatsapp_correct_number fixes a customer whose only message ever resolved to the bad fallback number", async () => {
    const chatId = "777222111@lid";
    const [first] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "30447375491177", // única mensagem do contato: resolveu errado, ninguém mais escreveu pra corrigir depois
      p_content: "Oi",
      p_external_message_id: "wa-correct-1",
      p_whatsapp_chat_id: chatId,
    });
    void first;

    await db.admin.rpc("whatsapp_correct_number", {
      p_tenant_id: tenantId,
      p_whatsapp_chat_id: chatId,
      p_whatsapp_number: "5511988884444",
    });

    const [customer] = await db.admin.query<{ whatsapp: string }>(
      "select whatsapp from public.customers where tenant_id = $1 and whatsapp_chat_id = $2",
      [tenantId, chatId],
    );
    expect(customer!.whatsapp).toBe("5511988884444");
  });

  it("whatsapp_correct_number never downgrades an already-good number, and does nothing for an unknown chat id", async () => {
    const chatId = "888333222@lid";
    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "5511922223333",
      p_content: "Oi",
      p_external_message_id: "wa-correct-2",
      p_whatsapp_chat_id: chatId,
    });

    await db.admin.rpc("whatsapp_correct_number", {
      p_tenant_id: tenantId,
      p_whatsapp_chat_id: chatId,
      p_whatsapp_number: "99988877766655", // parece pior (mais dígitos) — não deve trocar
    });
    const [customer] = await db.admin.query<{ whatsapp: string }>(
      "select whatsapp from public.customers where tenant_id = $1 and whatsapp_chat_id = $2",
      [tenantId, chatId],
    );
    expect(customer!.whatsapp).toBe("5511922223333");

    // chat id que não existe: não cria nada, não estoura erro.
    await db.admin.rpc("whatsapp_correct_number", {
      p_tenant_id: tenantId,
      p_whatsapp_chat_id: "999999999@lid",
      p_whatsapp_number: "5511900001111",
    });
    const orphan = await db.admin.query(
      "select id from public.customers where tenant_id = $1 and whatsapp_chat_id = $2",
      [tenantId, "999999999@lid"],
    );
    expect(orphan).toHaveLength(0);
  });

  it("reuses the same conversation for a customer who writes again, accumulating unread count", async () => {
    const [first] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11977776666",
      p_content: "Mensagem 1",
      p_external_message_id: "wa-msg-again-1",
    });
    const [second] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11977776666",
      p_content: "Mensagem 2",
      p_external_message_id: "wa-msg-again-2",
    });
    expect(second!.whatsapp_receive_message).not.toBe(first!.whatsapp_receive_message);

    const conversations = await db.as(ownerId).query<{ id: string; unread_count: number }>(
      `select c.id, c.unread_count from public.conversations c
       join public.customers cu on cu.id = c.customer_id
       where cu.whatsapp = $1 and c.tenant_id = $2`,
      ["11977776666", tenantId],
    );
    expect(conversations).toHaveLength(1); // uma thread só, nunca uma por mensagem
    expect(conversations[0]!.unread_count).toBe(2);
  });

  it("is idempotent by external_message_id: redelivering the same message never duplicates it", async () => {
    const [first] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11966665555",
      p_content: "Só uma vez",
      p_external_message_id: "wa-msg-idempotent",
    });
    const [second] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11966665555",
      p_content: "Só uma vez",
      p_external_message_id: "wa-msg-idempotent",
    });
    expect(second!.whatsapp_receive_message).toBe(first!.whatsapp_receive_message);

    const [conversation] = await db.admin.query<{ id: string; unread_count: number }>(
      `select c.id, c.unread_count from public.conversations c
       join public.customers cu on cu.id = c.customer_id
       where cu.whatsapp = $1 and c.tenant_id = $2`,
      ["11966665555", tenantId],
    );
    expect(conversation!.unread_count).toBe(1); // não incrementou de novo na reentrega

    const messages = await db.admin.query(
      "select id from public.messages where tenant_id = $1 and external_message_id = $2",
      [tenantId, "wa-msg-idempotent"],
    );
    expect(messages).toHaveLength(1);
  });

  it("emits a whatsapp.message_received timeline event on the customer", async () => {
    const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11955554444",
      p_content: "Preciso de ajuda",
      p_external_message_id: "wa-msg-timeline",
    });
    void row;
    const [customer] = await db.admin.query<{ id: string }>("select id from public.customers where whatsapp = $1", [
      "11955554444",
    ]);
    const events = await db
      .as(ownerId)
      .query<{ type: string }>("select type from public.timeline_events where customer_id = $1", [customer!.id]);
    expect(events.map((e) => e.type)).toContain("whatsapp.message_received");
  });

  async function seedConversation(number: string) {
    const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: number,
      p_content: "Olá",
      p_external_message_id: `wa-${number}-${Date.now()}-${Math.random()}`,
    });
    void row;
    const [conversation] = await db.admin.query<{ id: string; customer_id: string }>(
      `select c.id, c.customer_id from public.conversations c
       join public.customers cu on cu.id = c.customer_id
       where cu.whatsapp = $1 and c.tenant_id = $2`,
      [number, tenantId],
    );
    return conversation!;
  }

  it("sends an outbound message as QUEUED, then the app marks it SENT or FAILED", async () => {
    const conversation = await seedConversation("11944443333");
    const [row] = await db.as(sellerId).rpc<{ message_send: string }>("message_send", {
      p_conversation_id: conversation.id,
      p_content: "Temos sim! Chocolate e baunilha.",
    });
    const messageId = row!.message_send;

    const [message] = await db.admin.query<{ status: string; direction: string; sender_type: string }>(
      "select status, direction, sender_type from public.messages where id = $1",
      [messageId],
    );
    expect(message!.status).toBe("QUEUED");
    expect(message!.direction).toBe("OUTBOUND");
    expect(message!.sender_type).toBe("USER");

    await db.as(sellerId).rpc("message_mark_sent", { p_message_id: messageId, p_external_message_id: "wa-out-1" });
    const [sent] = await db.admin.query<{ status: string; external_message_id: string }>(
      "select status, external_message_id from public.messages where id = $1",
      [messageId],
    );
    expect(sent!.status).toBe("SENT");
    expect(sent!.external_message_id).toBe("wa-out-1");
  });

  it("marks a failed send without ever silently succeeding", async () => {
    const conversation = await seedConversation("11933332222");
    const [row] = await db.as(sellerId).rpc<{ message_send: string }>("message_send", {
      p_conversation_id: conversation.id,
      p_content: "Isso não vai sair",
    });
    await db
      .as(sellerId)
      .rpc("message_mark_failed", { p_message_id: row!.message_send, p_reason: "Sessão desconectada" });
    const [message] = await db.admin.query<{ status: string; failed_reason: string }>(
      "select status, failed_reason from public.messages where id = $1",
      [row!.message_send],
    );
    expect(message!.status).toBe("FAILED");
    expect(message!.failed_reason).toBe("Sessão desconectada");
  });

  it("rejects a message without content and without media", async () => {
    const conversation = await seedConversation("11922221111");
    await expect(db.as(sellerId).rpc("message_send", { p_conversation_id: conversation.id })).rejects.toThrow();
  });

  it("handoff: assume, return to AI and pause all transition status and log timeline events", async () => {
    const conversation = await seedConversation("11911110000");

    await db.as(sellerId).rpc("conversation_assume", { p_conversation_id: conversation.id });
    let [row] = await db.admin.query<{ status: string; responsible_user_id: string }>(
      "select status, responsible_user_id from public.conversations where id = $1",
      [conversation.id],
    );
    expect(row!.status).toBe("HUMAN_ACTIVE");
    expect(row!.responsible_user_id).toBe(sellerId);

    await db.as(sellerId).rpc("conversation_return_to_ai", { p_conversation_id: conversation.id });
    [row] = await db.admin.query<{ status: string; responsible_user_id: string }>(
      "select status, responsible_user_id from public.conversations where id = $1",
      [conversation.id],
    );
    expect(row!.status).toBe("AI_ACTIVE");
    expect(row!.responsible_user_id).toBeNull();

    await db.as(sellerId).rpc("conversation_pause", { p_conversation_id: conversation.id });
    [row] = await db.admin.query<{ status: string; responsible_user_id: string }>(
      "select status from public.conversations where id = $1",
      [conversation.id],
    );
    expect(row!.status).toBe("PAUSED");

    const events = await db
      .as(ownerId)
      .query<{ type: string }>(
        "select type from public.timeline_events where customer_id = $1 and type like 'conversation.%' order by occurred_at",
        [conversation.customer_id],
      );
    expect(events.map((e) => e.type)).toEqual([
      "conversation.assumed",
      "conversation.returned_to_ai",
      "conversation.paused",
    ]);
  });

  it("marking a conversation as read zeroes the unread count", async () => {
    const conversation = await seedConversation("11900009999");
    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11900009999",
      p_content: "Mais uma",
      p_external_message_id: `wa-extra-${Date.now()}`,
    });
    let [row] = await db.admin.query<{ unread_count: number }>(
      "select unread_count from public.conversations where id = $1",
      [conversation.id],
    );
    expect(row!.unread_count).toBe(2);

    await db.as(sellerId).rpc("conversation_mark_read", { p_conversation_id: conversation.id });
    [row] = await db.admin.query<{ unread_count: number }>(
      "select unread_count from public.conversations where id = $1",
      [conversation.id],
    );
    expect(row!.unread_count).toBe(0);
  });

  it("closes a conversation, clearing the responsible user and logging a timeline event", async () => {
    const conversation = await seedConversation("11866665555");
    await db.as(sellerId).rpc("conversation_assume", { p_conversation_id: conversation.id });

    await db.as(sellerId).rpc("conversation_close", { p_conversation_id: conversation.id, p_reason: "Resolvido" });
    const [row] = await db.admin.query<{ status: string; responsible_user_id: string | null }>(
      "select status, responsible_user_id from public.conversations where id = $1",
      [conversation.id],
    );
    expect(row!.status).toBe("CLOSED");
    expect(row!.responsible_user_id).toBeNull();

    const events = await db
      .as(ownerId)
      .query<{ type: string }>("select type from public.timeline_events where customer_id = $1 and type = $2", [
        conversation.customer_id,
        "conversation.closed",
      ]);
    expect(events).toHaveLength(1);
  });

  it("rejects closing a conversation that is already closed", async () => {
    const conversation = await seedConversation("11855554444");
    await db.as(sellerId).rpc("conversation_close", { p_conversation_id: conversation.id });
    await expect(db.as(sellerId).rpc("conversation_close", { p_conversation_id: conversation.id })).rejects.toThrow(
      "invalid_input",
    );
  });

  it("reopens a closed conversation as HUMAN_ACTIVE on the next message when the tenant has no AI enabled", async () => {
    const conversation = await seedConversation("11844443333");
    await db.as(sellerId).rpc("conversation_close", { p_conversation_id: conversation.id });

    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11844443333",
      p_content: "Voltei",
      p_external_message_id: `wa-reopen-${Date.now()}`,
    });

    const [row] = await db.admin.query<{ status: string }>("select status from public.conversations where id = $1", [
      conversation.id,
    ]);
    expect(row!.status).toBe("HUMAN_ACTIVE");
  });

  it("reopens a closed conversation as AI_ACTIVE on the next message when the tenant has AI enabled", async () => {
    const aiTenant = await db.createTenantWithOwner("Loja com IA");
    await db.as(aiTenant.ownerId).rpc("ai_settings_update", { p_tenant_id: aiTenant.tenantId, p_enabled: true });

    const [created] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: aiTenant.tenantId,
      p_whatsapp_number: "11833332222",
      p_content: "Oi",
      p_external_message_id: `wa-ai-1-${Date.now()}`,
    });
    void created;
    const [conversation] = await db.admin.query<{ id: string }>(
      `select c.id from public.conversations c join public.customers cu on cu.id = c.customer_id
       where cu.whatsapp = $1 and c.tenant_id = $2`,
      ["11833332222", aiTenant.tenantId],
    );

    await db.as(aiTenant.ownerId).rpc("conversation_close", { p_conversation_id: conversation!.id });
    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: aiTenant.tenantId,
      p_whatsapp_number: "11833332222",
      p_content: "Voltei também",
      p_external_message_id: `wa-ai-2-${Date.now()}`,
    });

    const [row] = await db.admin.query<{ status: string }>("select status from public.conversations where id = $1", [
      conversation!.id,
    ]);
    expect(row!.status).toBe("AI_ACTIVE");
  });

  it("never resets the status of a conversation that is not closed when a new message arrives", async () => {
    const conversation = await seedConversation("11822221111");
    await db.as(sellerId).rpc("conversation_pause", { p_conversation_id: conversation.id });

    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11822221111",
      p_content: "Mais uma enquanto pausada",
      p_external_message_id: `wa-still-paused-${Date.now()}`,
    });

    const [row] = await db.admin.query<{ status: string }>("select status from public.conversations where id = $1", [
      conversation.id,
    ]);
    expect(row!.status).toBe("PAUSED");
  });

  it("RLS isolates conversations and messages between tenants", async () => {
    const other = await db.createTenantWithOwner("Outra Loja");
    const conversation = await seedConversation("11888887777");

    const visible = await db
      .as(other.ownerId)
      .query("select id from public.conversations where id = $1", [conversation.id]);
    expect(visible).toHaveLength(0);
  });

  it("cannot access a conversation from another tenant through the RPCs (forbidden, not leaked as not_found)", async () => {
    const other = await db.createTenantWithOwner("Loja Vizinha");
    const conversation = await seedConversation("11877776666");
    await expect(
      db.as(other.ownerId).rpc("conversation_assume", { p_conversation_id: conversation.id }),
    ).rejects.toThrow("forbidden");
  });

  it("matches a manually-registered customer by phone when they later message on that same number by WhatsApp, instead of trying (and failing) to create a duplicate", async () => {
    const [manual] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Cadastrado Manualmente",
        "11966660000",
      ]);

    const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: "11966660000",
      p_content: "Oi, sou eu",
      p_external_message_id: "wa-phone-match-1",
    });
    expect(row!.whatsapp_receive_message).toBeTruthy();

    const customers = await db.admin.query<{ id: string }>(
      "select id from public.customers where tenant_id = $1 and (phone = $2 or whatsapp = $2)",
      [tenantId, "11966660000"],
    );
    expect(customers).toHaveLength(1);
    expect(customers[0]!.id).toBe(manual!.id);
  });
});
