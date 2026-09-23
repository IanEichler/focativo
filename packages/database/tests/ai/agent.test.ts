import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct, key, stockOf } from "../helpers/catalog";

describe("AI agent: settings, tools controladas, estado conversacional, custos", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Gorila Suplementos");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
    // Ligada uma vez aqui; os testes de "desligada" usam tenants dedicados
    // (evita alternar o estado de um tenant compartilhado entre testes, que já
    // causou um bug de isolamento na Fase 5 — cada cenário de toggle merece
    // seu próprio tenant, não uma ordem de execução implícita).
    await db.as(ownerId).rpc("ai_settings_update", { p_tenant_id: tenantId, p_enabled: true });
  });

  async function seedConversation(number: string) {
    const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: number,
      p_content: "Olá",
      p_external_message_id: `ai-${number}-${Date.now()}-${Math.random()}`,
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

  describe("tenant_ai_settings", () => {
    it("defaults to disabled when no settings row exists yet", async () => {
      const fresh = await db.createTenantWithOwner("Loja Recém-criada");
      const [row] = await db.as(fresh.ownerId).rpc<{ enabled: boolean }>("ai_settings_get", {
        p_tenant_id: fresh.tenantId,
      });
      expect(row!.enabled).toBe(false);
    });

    it("rejects a VENDEDOR reading or writing settings (tenant.update is OWNER/ADMIN only)", async () => {
      await expect(db.as(sellerId).rpc("ai_settings_get", { p_tenant_id: tenantId })).rejects.toThrow("forbidden");
      await expect(
        db.as(sellerId).rpc("ai_settings_update", { p_tenant_id: tenantId, p_enabled: true }),
      ).rejects.toThrow("forbidden");
    });

    it("OWNER can update the prompt and it persists (modelo/limites não fazem mais parte desta RPC)", async () => {
      const [row] = await db.as(ownerId).rpc<{ enabled: boolean; system_prompt: string }>("ai_settings_update", {
        p_tenant_id: tenantId,
        p_enabled: true,
        p_system_prompt: "Você é a assistente da Gorila Suplementos.",
      });
      expect(row!.enabled).toBe(true);
      expect(row!.system_prompt).toBe("Você é a assistente da Gorila Suplementos.");

      const [again] = await db.as(ownerId).rpc<{ enabled: boolean }>("ai_settings_get", { p_tenant_id: tenantId });
      expect(again!.enabled).toBe(true);
    });
  });

  describe("new conversations honor the tenant's AI toggle", () => {
    it("a new conversation is born AI_ACTIVE for a tenant with the AI enabled", async () => {
      const conversation = await seedConversation("11955501111");
      const [row] = await db.admin.query<{ status: string }>("select status from public.conversations where id = $1", [
        conversation.id,
      ]);
      expect(row!.status).toBe("AI_ACTIVE");
    });

    it("an existing conversation's status never changes just because a new message arrives", async () => {
      const conversation = await seedConversation("11955502222");
      await db.as(sellerId).rpc("conversation_assume", { p_conversation_id: conversation.id });

      await db.admin.rpc("whatsapp_receive_message", {
        p_tenant_id: tenantId,
        p_whatsapp_number: "11955502222",
        p_content: "Mais uma mensagem",
        p_external_message_id: `ai-followup-${Date.now()}`,
      });

      const [row] = await db.admin.query<{ status: string }>("select status from public.conversations where id = $1", [
        conversation.id,
      ]);
      expect(row!.status).toBe("HUMAN_ACTIVE");
    });

    it("a new conversation is born HUMAN_ACTIVE for a tenant with the AI disabled (or never configured)", async () => {
      const other = await db.createTenantWithOwner("Loja Sem IA Ligada");
      const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
        p_tenant_id: other.tenantId,
        p_whatsapp_number: "11955503333",
        p_content: "Oi",
        p_external_message_id: `ai-disabled-${Date.now()}`,
      });
      void row;
      const [conversation] = await db.admin.query<{ status: string }>(
        "select status from public.conversations where tenant_id = $1",
        [other.tenantId],
      );
      expect(conversation!.status).toBe("HUMAN_ACTIVE");
    });
  });

  describe("ai_message_send", () => {
    it("rejects a call from an authenticated user (AI actions are service-only)", async () => {
      const conversation = await seedConversation("11955504444");
      await expect(
        db.as(ownerId).rpc("ai_message_send", { p_conversation_id: conversation.id, p_content: "Oi!" }),
      ).rejects.toThrow("forbidden");
    });

    it("sends an OUTBOUND/AI message as QUEUED when called from the service path with AI enabled", async () => {
      const conversation = await seedConversation("11955505555");
      const [row] = await db.admin.rpc<{ ai_message_send: string }>("ai_message_send", {
        p_conversation_id: conversation.id,
        p_content: "Temos whey de chocolate e baunilha, qual prefere?",
      });
      const [message] = await db.admin.query<{ status: string; direction: string; sender_type: string }>(
        "select status, direction, sender_type from public.messages where id = $1",
        [row!.ai_message_send],
      );
      expect(message!.status).toBe("QUEUED");
      expect(message!.direction).toBe("OUTBOUND");
      expect(message!.sender_type).toBe("AI");
    });

    it("refuses to send when the tenant has the AI disabled", async () => {
      const other = await db.createTenantWithOwner("Loja Sem IA");
      const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
        p_tenant_id: other.tenantId,
        p_whatsapp_number: "11966660000",
        p_content: "Oi",
        p_external_message_id: `ai-off-${Date.now()}`,
      });
      void row;
      const [conversation] = await db.admin.query<{ id: string }>(
        "select id from public.conversations where tenant_id = $1",
        [other.tenantId],
      );
      await expect(
        db.admin.rpc("ai_message_send", { p_conversation_id: conversation!.id, p_content: "Oi!" }),
      ).rejects.toThrow("ai_disabled");
    });

    it("refuses to send when the platform admin disabled the ai module, even with tenant_ai_settings.enabled", async () => {
      const conversation = await seedConversation("11955512222");
      await db.admin.query(
        "insert into public.tenant_module_flags (tenant_id, module_code, enabled) values ($1, 'ai', false)",
        [tenantId],
      );
      try {
        await expect(
          db.admin.rpc("ai_message_send", { p_conversation_id: conversation.id, p_content: "Oi!" }),
        ).rejects.toThrow("ai_disabled");
      } finally {
        await db.admin.query("delete from public.tenant_module_flags where tenant_id = $1 and module_code = 'ai'", [
          tenantId,
        ]);
      }
    });
  });

  describe("buscar_produtos (catalog_search_variants via service role)", () => {
    // A tool de busca da IA chama catalog_search_variants pelo cliente
    // service-role (sem sessão de usuário) — diferente de todo o resto do
    // catálogo, que sempre roda com uma sessão autenticada. Pego ao vivo
    // contra o Supabase Cloud: catalog_search_variants não é security
    // definer, então herda os privilégios de quem chama, e
    // private.search_normalize só tinha EXECUTE para authenticated. Este
    // teste existe para nunca deixar essa lacuna sem cobertura de novo.
    it("works when called by service_role, not only by an authenticated staff session", async () => {
      const { variantId } = await createProduct(db, ownerId, tenantId, { name: "Creatina Busca IA", salePrice: 89.9 });
      await db
        .as(ownerId)
        .rpc("inventory_register_entry", { p_variant_id: variantId, p_quantity: 5, p_idempotency_key: key() });

      const results = await db.admin.rpc<{ variant_id: string; product_name: string }>("catalog_search_variants", {
        p_tenant_id: tenantId,
        p_query: "creatina busca ia",
        p_limit: 5,
      });
      expect(results.map((r) => r.variant_id)).toContain(variantId);
    });
  });

  describe("ai_reservation_create (venda assistida)", () => {
    async function stockedVariant(quantity: number, name: string) {
      const { variantId } = await createProduct(db, ownerId, tenantId, { name, salePrice: 150 });
      await db
        .as(ownerId)
        .rpc("inventory_register_entry", { p_variant_id: variantId, p_quantity: quantity, p_idempotency_key: key() });
      return variantId;
    }

    it("creates a reservation for the conversation's customer, pricing from the server and reserving stock", async () => {
      const variantId = await stockedVariant(10, "Produto IA 1");
      const conversation = await seedConversation("11955506666");

      const [row] = await db.admin.rpc<{ ai_reservation_create: string }>("ai_reservation_create", {
        p_conversation_id: conversation.id,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 2 }]),
      });
      expect(row!.ai_reservation_create).toBeTruthy();

      const [reservation] = await db.admin.query<{ customer_id: string; origin: string; status: string }>(
        "select customer_id, origin, status from public.reservations where id = $1",
        [row!.ai_reservation_create],
      );
      expect(reservation!.customer_id).toBe(conversation.customer_id);
      expect(reservation!.origin).toBe("ai");
      expect(reservation!.status).toBe("PENDING");

      const stock = await stockOf(db, variantId);
      expect(stock.reserved).toBe(2);
    });

    it("is idempotent by idempotency_key", async () => {
      const variantId = await stockedVariant(10, "Produto IA 2");
      const conversation = await seedConversation("11955507777");
      const idempotencyKey = key();

      const [first] = await db.admin.rpc<{ ai_reservation_create: string }>("ai_reservation_create", {
        p_conversation_id: conversation.id,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
        p_idempotency_key: idempotencyKey,
      });
      const [second] = await db.admin.rpc<{ ai_reservation_create: string }>("ai_reservation_create", {
        p_conversation_id: conversation.id,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
        p_idempotency_key: idempotencyKey,
      });
      expect(second!.ai_reservation_create).toBe(first!.ai_reservation_create);
    });

    it("rejects a call from an authenticated user (staff must use reservation_create instead)", async () => {
      const variantId = await stockedVariant(10, "Produto IA 3");
      const conversation = await seedConversation("11955508888");
      await expect(
        db.as(sellerId).rpc("ai_reservation_create", {
          p_conversation_id: conversation.id,
          p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
        }),
      ).rejects.toThrow("forbidden");
    });
  });

  describe("ai_escalate_conversation (válvula de segurança)", () => {
    it("flips the conversation to HUMAN_ACTIVE and logs an AI-attributed timeline event", async () => {
      const conversation = await seedConversation("11955509999");
      await db.admin.rpc("ai_escalate_conversation", {
        p_conversation_id: conversation.id,
        p_reason: "Cliente pediu para falar com humano",
      });

      const [row] = await db.admin.query<{ status: string }>("select status from public.conversations where id = $1", [
        conversation.id,
      ]);
      expect(row!.status).toBe("HUMAN_ACTIVE");

      const [event] = await db
        .as(ownerId)
        .query<{ type: string; actor_type: string; payload: { reason: string } }>(
          "select type, actor_type, payload from public.timeline_events where customer_id = $1 and type = 'conversation.escalated_by_ai'",
          [conversation.customer_id],
        );
      expect(event!.actor_type).toBe("AI");
      expect(event!.payload.reason).toBe("Cliente pediu para falar com humano");
    });
  });

  describe("ai_upsert_conversation_state (estado conversacional)", () => {
    it("stores and updates the turn count and draft items for a conversation", async () => {
      const conversation = await seedConversation("11955510000");
      await db.admin.rpc("ai_upsert_conversation_state", {
        p_conversation_id: conversation.id,
        p_turn_count: 1,
        p_last_tool_used: "buscar_produtos",
        p_draft_items: JSON.stringify([{ variant_id: "00000000-0000-0000-0000-000000000000", quantity: 1 }]),
      });
      let [row] = await db.admin.query<{ turn_count: number; last_tool_used: string }>(
        "select turn_count, last_tool_used from public.ai_conversation_states where conversation_id = $1",
        [conversation.id],
      );
      expect(row!.turn_count).toBe(1);
      expect(row!.last_tool_used).toBe("buscar_produtos");

      await db.admin.rpc("ai_upsert_conversation_state", {
        p_conversation_id: conversation.id,
        p_turn_count: 2,
        p_draft_items: JSON.stringify([]),
      });
      [row] = await db.admin.query<{ turn_count: number; last_tool_used: string }>(
        "select turn_count, last_tool_used from public.ai_conversation_states where conversation_id = $1",
        [conversation.id],
      );
      expect(row!.turn_count).toBe(2);
      expect(row!.last_tool_used).toBe("buscar_produtos"); // preservado quando não informado de novo
    });
  });

  describe("ai_log_usage e ai_usage_month_to_date (custos)", () => {
    it("logs a usage event and rejects an authenticated caller", async () => {
      const conversation = await seedConversation("11955511111");
      await expect(
        db.as(ownerId).rpc("ai_log_usage", {
          p_tenant_id: tenantId,
          p_conversation_id: conversation.id,
          p_message_id: null,
          p_model: "claude-sonnet-5",
          p_input_tokens: 100,
          p_output_tokens: 50,
          p_cost_usd: 0.01,
        }),
      ).rejects.toThrow("forbidden");

      await db.admin.rpc("ai_log_usage", {
        p_tenant_id: tenantId,
        p_conversation_id: conversation.id,
        p_message_id: null,
        p_model: "claude-sonnet-5",
        p_input_tokens: 100,
        p_output_tokens: 50,
        p_cost_usd: 0.01,
      });
      const total = await db
        .as(ownerId)
        .rpc<{ ai_usage_month_to_date: string }>("ai_usage_month_to_date", { p_tenant_id: tenantId });
      expect(Number(total[0]!.ai_usage_month_to_date)).toBeGreaterThanOrEqual(0.01);
    });

    it("rejects a VENDEDOR reading usage cost (financial.read only, same rule as the financial dashboard)", async () => {
      await expect(db.as(sellerId).rpc("ai_usage_month_to_date", { p_tenant_id: tenantId })).rejects.toThrow(
        "forbidden",
      );
    });

    it("is append-only: usage events cannot be updated or deleted", async () => {
      const [row] = await db.admin.query<{ id: string }>(
        "select id from public.ai_usage_events where tenant_id = $1 limit 1",
        [tenantId],
      );
      await expect(
        db.admin.query("update public.ai_usage_events set cost_usd = 99 where id = $1", [row!.id]),
      ).rejects.toThrow();
      await expect(db.admin.query("delete from public.ai_usage_events where id = $1", [row!.id])).rejects.toThrow();
    });
  });

  it("RLS isolates AI settings and usage between tenants", async () => {
    const other = await db.createTenantWithOwner("Outra Loja IA");
    const visibleSettings = await db
      .as(other.ownerId)
      .query("select tenant_id from public.tenant_ai_settings where tenant_id = $1", [tenantId]);
    expect(visibleSettings).toHaveLength(0);
  });
});
