import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("agenda: catálogo de serviços, agendamentos e concorrência", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let customerId: string;
  let serviceId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Clínica Teste");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

    const [customer] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Paciente Teste",
        "11988887777",
      ]);
    customerId = customer!.id;

    const [row] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
      p_tenant_id: tenantId,
      p_name: "Consulta inicial",
      p_duration_minutes: 30,
      p_price: 250,
      p_description: "Primeira consulta com avaliação completa.",
    });
    serviceId = row!.agenda_service_create;
  });

  function isoIn(hours: number) {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  it("rejects service creation from someone outside the tenant", async () => {
    const outsider = await db.createUser({ email: "de-fora@example.com" });
    await expectDbError(
      db
        .as(outsider)
        .rpc("agenda_service_create", { p_tenant_id: tenantId, p_name: "X", p_duration_minutes: 30, p_price: 10 }),
      "forbidden",
    );
  });

  it("creates and updates a service with requires_human_confirmation and restrictions", async () => {
    const [created] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
      p_tenant_id: tenantId,
      p_name: "Procedimento delicado",
      p_duration_minutes: 60,
      p_price: 400,
      p_requires_human_confirmation: true,
      p_restrictions: "Não recomendado para gestantes.",
    });
    const id = created!.agenda_service_create;

    const [row] = await db.admin.query<{ requires_human_confirmation: boolean; restrictions: string }>(
      "select requires_human_confirmation, restrictions from public.agenda_services where id = $1",
      [id],
    );
    expect(row!.requires_human_confirmation).toBe(true);
    expect(row!.restrictions).toBe("Não recomendado para gestantes.");

    await db.as(ownerId).rpc("agenda_service_update", {
      p_service_id: id,
      p_name: "Procedimento delicado",
      p_duration_minutes: 60,
      p_price: 400,
      p_is_active: true,
      p_requires_human_confirmation: false,
      p_restrictions: null,
    });
    const [updated] = await db.admin.query<{ requires_human_confirmation: boolean; restrictions: string | null }>(
      "select requires_human_confirmation, restrictions from public.agenda_services where id = $1",
      [id],
    );
    expect(updated!.requires_human_confirmation).toBe(false);
    expect(updated!.restrictions).toBeNull();
  });

  it("defaults requires_human_confirmation to false when a service is created without it", async () => {
    const [row] = await db.admin.query<{ requires_human_confirmation: boolean }>(
      "select requires_human_confirmation from public.agenda_services where id = $1",
      [serviceId],
    );
    expect(row!.requires_human_confirmation).toBe(false);
  });

  it("creates an appointment computing ends_at from the service duration", async () => {
    const startsAt = isoIn(24);
    const [row] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_professional_user_id: ownerId,
      p_starts_at: startsAt,
    });
    const appointmentId = row!.agenda_appointment_create;
    expect(appointmentId).toBeTruthy();

    const [appointment] = await db.admin.query<{ starts_at: string; ends_at: string; status: string }>(
      "select starts_at, ends_at, status from public.agenda_appointments where id = $1",
      [appointmentId],
    );
    expect(appointment!.status).toBe("SCHEDULED");
    const diffMinutes = (new Date(appointment!.ends_at).getTime() - new Date(appointment!.starts_at).getTime()) / 60000;
    expect(diffMinutes).toBe(30);
  });

  it("is idempotent by idempotency_key", async () => {
    const startsAt = isoIn(48);
    const idempotencyKey = `test-agenda-${Date.now()}`;
    const [first] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_professional_user_id: ownerId,
      p_starts_at: startsAt,
      p_idempotency_key: idempotencyKey,
    });
    const [second] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_professional_user_id: ownerId,
      p_starts_at: startsAt,
      p_idempotency_key: idempotencyKey,
    });
    expect(second!.agenda_appointment_create).toBe(first!.agenda_appointment_create);
  });

  it("never double-books the same professional (concurrency, seção 28 do escopo levada pra agenda)", async () => {
    const startsAt = isoIn(72);
    const attempts = await Promise.allSettled([
      db.as(sellerId).rpc("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: serviceId,
        p_professional_user_id: ownerId,
        p_starts_at: startsAt,
      }),
      db.as(sellerId).rpc("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: serviceId,
        p_professional_user_id: ownerId,
        p_starts_at: startsAt,
      }),
    ]);
    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String((failed[0] as PromiseRejectedResult).reason)).toContain("slot_unavailable");
  });

  it("a different professional can be booked for the exact same time (conflict is per-professional)", async () => {
    const startsAt = isoIn(96);
    const otherProfessional = await db.addActiveMember(tenantId, "GERENTE", "outro-profissional@example.com");
    await db.as(sellerId).rpc("agenda_appointment_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_professional_user_id: ownerId,
      p_starts_at: startsAt,
    });
    const [row] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_professional_user_id: otherProfessional,
      p_starts_at: startsAt,
    });
    expect(row!.agenda_appointment_create).toBeTruthy();
  });

  it("cancel and advance transitions are audited on the customer timeline", async () => {
    const [row] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_professional_user_id: ownerId,
      p_starts_at: isoIn(120),
    });
    const appointmentId = row!.agenda_appointment_create;

    await db.as(sellerId).rpc("agenda_appointment_advance", { p_appointment_id: appointmentId, p_status: "CONFIRMED" });
    let [appointment] = await db.admin.query<{ status: string }>(
      "select status from public.agenda_appointments where id = $1",
      [appointmentId],
    );
    expect(appointment!.status).toBe("CONFIRMED");

    await db
      .as(sellerId)
      .rpc("agenda_appointment_cancel", { p_appointment_id: appointmentId, p_reason: "Paciente remarcou" });
    [appointment] = await db.admin.query<{ status: string }>(
      "select status from public.agenda_appointments where id = $1",
      [appointmentId],
    );
    expect(appointment!.status).toBe("CANCELED");

    const events = await db
      .as(ownerId)
      .query<{ type: string }>(
        "select type from public.timeline_events where customer_id = $1 and type like 'appointment.%' order by occurred_at",
        [customerId],
      );
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["appointment.created", "appointment.confirmed", "appointment.canceled"]),
    );
  });

  describe("agenda_service_set_professionals (elegibilidade por serviço)", () => {
    it("a service with no professionals set can be booked with anyone (default aberto)", async () => {
      const startsAt = isoIn(150);
      const [row] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: serviceId,
        p_professional_user_id: ownerId,
        p_starts_at: startsAt,
      });
      expect(row!.agenda_appointment_create).toBeTruthy();
    });

    it("once a service has eligible professionals, only they can be booked for it", async () => {
      const [dedicatedService] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
        p_tenant_id: tenantId,
        p_name: "Cirurgia especializada",
        p_duration_minutes: 60,
        p_price: 500,
      });
      const dedicatedServiceId = dedicatedService!.agenda_service_create;
      const specialist = await db.addActiveMember(tenantId, "GERENTE", "especialista@example.com");
      const generalist = await db.addActiveMember(tenantId, "VENDEDOR", "generalista@example.com");

      await db.as(ownerId).rpc("agenda_service_set_professionals", {
        p_service_id: dedicatedServiceId,
        p_professional_user_ids: [specialist],
      });

      const eligible = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: dedicatedServiceId,
        p_professional_user_id: specialist,
        p_starts_at: isoIn(160),
      });
      expect(eligible[0]!.agenda_appointment_create).toBeTruthy();

      await expectDbError(
        db.as(sellerId).rpc("agenda_appointment_create", {
          p_tenant_id: tenantId,
          p_customer_id: customerId,
          p_service_id: dedicatedServiceId,
          p_professional_user_id: generalist,
          p_starts_at: isoIn(170),
        }),
        "professional_not_eligible",
      );
    });

    it("clearing the list (empty array) reopens the service to any professional", async () => {
      const [service] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
        p_tenant_id: tenantId,
        p_name: "Serviço reaberto",
        p_duration_minutes: 20,
        p_price: 100,
      });
      const reopenedServiceId = service!.agenda_service_create;
      const specialist = await db.addActiveMember(tenantId, "GERENTE", "especialista2@example.com");

      await db.as(ownerId).rpc("agenda_service_set_professionals", {
        p_service_id: reopenedServiceId,
        p_professional_user_ids: [specialist],
      });
      await db
        .as(ownerId)
        .rpc("agenda_service_set_professionals", { p_service_id: reopenedServiceId, p_professional_user_ids: [] });

      const [row] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: reopenedServiceId,
        p_professional_user_id: ownerId,
        p_starts_at: isoIn(180),
      });
      expect(row!.agenda_appointment_create).toBeTruthy();
    });

    it("non-admins cannot change a service's eligible professionals", async () => {
      const outsider = await db.createUser({ email: "de-fora-2@example.com" });
      await expectDbError(
        db
          .as(outsider)
          .rpc("agenda_service_set_professionals", { p_service_id: serviceId, p_professional_user_ids: [] }),
        "forbidden",
      );
    });
  });

  describe("ai_agenda_book", () => {
    async function seedConversation(number: string) {
      const [row] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
        p_tenant_id: tenantId,
        p_whatsapp_number: number,
        p_content: "Olá",
        p_external_message_id: `agenda-${number}-${Date.now()}`,
      });
      void row;
      const [conversation] = await db.admin.query<{ id: string }>(
        `select c.id from public.conversations c join public.customers cu on cu.id = c.customer_id
         where cu.whatsapp = $1 and c.tenant_id = $2`,
        [number, tenantId],
      );
      return conversation!.id;
    }

    it("rejects a call from an authenticated user (service-only, same as ai_reservation_create)", async () => {
      const conversationId = await seedConversation("11999990001");
      await expect(
        db.as(ownerId).rpc("ai_agenda_book", {
          p_conversation_id: conversationId,
          p_service_id: serviceId,
          p_professional_user_id: ownerId,
          p_starts_at: isoIn(200),
        }),
      ).rejects.toThrow("forbidden");
    });

    it("books an appointment for the conversation's customer when the AI is enabled", async () => {
      await db.as(ownerId).rpc("ai_settings_update", { p_tenant_id: tenantId, p_enabled: true });
      const conversationId = await seedConversation("11999990002");

      const [row] = await db.admin.rpc<{ ai_agenda_book: string }>("ai_agenda_book", {
        p_conversation_id: conversationId,
        p_service_id: serviceId,
        p_professional_user_id: ownerId,
        p_starts_at: isoIn(220),
      });
      const [appointment] = await db.admin.query<{ origin: string; status: string }>(
        "select origin, status from public.agenda_appointments where id = $1",
        [row!.ai_agenda_book],
      );
      expect(appointment!.origin).toBe("ai");
      expect(appointment!.status).toBe("SCHEDULED");
    });

    it("requires a human to review before the AI can book a service marked requires_human_confirmation, then books it for real once returned", async () => {
      const [gatedService] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
        p_tenant_id: tenantId,
        p_name: "Procedimento com revisão",
        p_duration_minutes: 30,
        p_price: 300,
        p_requires_human_confirmation: true,
      });
      const gatedServiceId = gatedService!.agenda_service_create;
      const conversationId = await seedConversation("11999990003");
      const startsAt = isoIn(300);

      await expectDbError(
        db.admin.rpc("ai_agenda_book", {
          p_conversation_id: conversationId,
          p_service_id: gatedServiceId,
          p_professional_user_id: ownerId,
          p_starts_at: startsAt,
        }),
        "human_confirmation_required",
      );
      const beforeCount = await db.admin.query(
        "select id from public.agenda_appointments where tenant_id = $1 and origin = 'ai' and service_id = $2",
        [tenantId, gatedServiceId],
      );
      expect(beforeCount).toHaveLength(0);

      // Retentar sem ninguém revisar continua bloqueado — não é uma trava de
      // "uma vez só", é enquanto não for liberado de verdade.
      await expectDbError(
        db.admin.rpc("ai_agenda_book", {
          p_conversation_id: conversationId,
          p_service_id: gatedServiceId,
          p_professional_user_id: ownerId,
          p_starts_at: startsAt,
        }),
        "human_confirmation_required",
      );

      // ai_agenda_book só recusa — quem grava o marcador de "pendente" é o
      // tool-executor.ts, numa chamada separada (um RAISE não capturado
      // desfaz qualquer escrita feita na mesma transação do RPC que falhou).
      await db.admin.rpc("ai_upsert_conversation_state", {
        p_conversation_id: conversationId,
        p_turn_count: 1,
        p_draft_items: JSON.stringify([{ type: "appointment_pending", human_cleared: false }]),
      });

      // Atendente assume o ticket e devolve à IA — esse gesto libera o agendamento.
      await db.as(sellerId).rpc("conversation_assume", { p_conversation_id: conversationId });
      await db.as(sellerId).rpc("conversation_return_to_ai", { p_conversation_id: conversationId });

      const [row] = await db.admin.rpc<{ ai_agenda_book: string }>("ai_agenda_book", {
        p_conversation_id: conversationId,
        p_service_id: gatedServiceId,
        p_professional_user_id: ownerId,
        p_starts_at: startsAt,
      });
      const [appointment] = await db.admin.query<{ origin: string }>(
        "select origin from public.agenda_appointments where id = $1",
        [row!.ai_agenda_book],
      );
      expect(appointment!.origin).toBe("ai");

      // O agendamento de staff (agenda_appointment_create) nunca foi afetado por esse gate.
      const [staffService] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
        p_tenant_id: tenantId,
        p_name: "Outro procedimento com revisão",
        p_duration_minutes: 30,
        p_price: 300,
        p_requires_human_confirmation: true,
      });
      const [staffBooking] = await db
        .as(sellerId)
        .rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
          p_tenant_id: tenantId,
          p_customer_id: customerId,
          p_service_id: staffService!.agenda_service_create,
          p_professional_user_id: ownerId,
          p_starts_at: isoIn(310),
        });
      expect(staffBooking!.agenda_appointment_create).toBeTruthy();
    });
  });

  it("RLS isolates services and appointments between tenants", async () => {
    const other = await db.createTenantWithOwner("Outra Clínica");
    const visibleServices = await db
      .as(other.ownerId)
      .query("select id from public.agenda_services where tenant_id = $1", [tenantId]);
    expect(visibleServices).toHaveLength(0);
  });
});

describe("business_type decide os módulos desligados por padrão", () => {
  const db = useTestDatabase();

  it("RETAIL (padrão) desliga 'agenda'", async () => {
    const ownerId = await db.createUser({ fullName: "Owner" });
    const [row] = await db
      .as(ownerId)
      .rpc<{ create_tenant: string }>("create_tenant", { p_name: "Loja Varejo Padrão" });
    const tenantId = row!.create_tenant;

    const [tenant] = await db.admin.query<{ business_type: string }>(
      "select business_type from public.tenants where id = $1",
      [tenantId],
    );
    expect(tenant!.business_type).toBe("RETAIL");

    const flags = await db.admin.query<{ module_code: string; enabled: boolean }>(
      "select module_code, enabled from public.tenant_module_flags where tenant_id = $1",
      [tenantId],
    );
    expect(flags).toEqual([{ module_code: "agenda", enabled: false }]);
  });

  it("SERVICES desliga catálogo/estoque/reservas/vendas e mantém agenda ligada", async () => {
    const ownerId = await db.createUser({ fullName: "Owner" });
    const [row] = await db.as(ownerId).rpc<{ create_tenant: string }>("create_tenant", {
      p_name: "Consultório de Serviços",
      p_business_type: "SERVICES",
    });
    const tenantId = row!.create_tenant;

    const flags = await db.admin.query<{ module_code: string; enabled: boolean }>(
      "select module_code, enabled from public.tenant_module_flags where tenant_id = $1 order by module_code",
      [tenantId],
    );
    expect(flags).toEqual([
      { module_code: "catalog", enabled: false },
      { module_code: "inventory", enabled: false },
      { module_code: "reservations", enabled: false },
      { module_code: "sales", enabled: false },
    ]);
  });

  it("admin_create_tenant also seeds the defaults for the chosen business_type", async () => {
    const superAdminId = await db.createUser({ email: "root-agenda@platform.test" });
    await db.makeSuperAdmin(superAdminId);
    const founder = await db.createUser({ email: "fundador-servicos@example.com" });

    const [row] = await db.as(superAdminId).rpc<{ admin_create_tenant: string }>("admin_create_tenant", {
      p_name: "Escritório Criado Pelo Admin",
      p_segment: "legal",
      p_owner_email: "fundador-servicos@example.com",
      p_business_type: "SERVICES",
    });
    void founder;
    const tenantId = row!.admin_create_tenant;

    const flags = await db.admin.query<{ module_code: string }>(
      "select module_code from public.tenant_module_flags where tenant_id = $1 order by module_code",
      [tenantId],
    );
    expect(flags.map((f) => f.module_code)).toEqual(["catalog", "inventory", "reservations", "sales"]);
  });
});
