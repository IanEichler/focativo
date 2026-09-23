import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("agenda: horário de funcionamento e exceções por profissional", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let customerId: string;
  let serviceId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Salão Teste");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

    const [customer] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Horário",
        "11977776666",
      ]);
    customerId = customer!.id;

    const [row] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
      p_tenant_id: tenantId,
      p_name: "Corte",
      p_duration_minutes: 30,
      p_price: 80,
    });
    serviceId = row!.agenda_service_create;
  });

  // Constrói um horário com offset -03:00 (America/Sao_Paulo, sem DST hoje) num
  // dia bem no futuro, evitando colisão com os agendamentos de outros testes.
  // O dia da semana é o que calhar de sair — os testes leem esse dia de volta
  // em vez de fixar uma data específica, pra não depender de qual dia é hoje.
  function localDatetime(daysAhead: number, hour: number, minute = 0) {
    const base = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth();
    const d = base.getUTCDate();
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`;
    const dayOfWeek = new Date(Date.UTC(y, m, d)).getUTCDay();
    return { iso, dayOfWeek, date: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
  }

  it("allows an appointment with no business hours configured (default aberto)", async () => {
    const { iso } = localDatetime(50, 10);
    const [row] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_professional_user_id: ownerId,
      p_starts_at: iso,
    });
    expect(row!.agenda_appointment_create).toBeTruthy();
  });

  it("rejects business hours from someone without agenda.write", async () => {
    const outsider = await db.createUser({ email: "sem-permissao-horario@example.com" });
    await expectDbError(
      db.as(outsider).rpc("agenda_business_hours_set", { p_tenant_id: tenantId, p_hours: JSON.stringify([]) }),
      "forbidden",
    );
  });

  it("sets and reads back business hours for the week", async () => {
    const { dayOfWeek } = localDatetime(51, 10);
    const rows = await db
      .as(ownerId)
      .rpc<{ day_of_week: number; opens_at: string; closes_at: string }>("agenda_business_hours_set", {
        p_tenant_id: tenantId,
        p_hours: JSON.stringify([{ day_of_week: dayOfWeek, opens_at: "09:00", closes_at: "18:00", is_closed: false }]),
      });
    expect(rows.find((r) => r.day_of_week === dayOfWeek)?.opens_at).toBe("09:00:00");

    const fetched = await db.as(sellerId).rpc<{ day_of_week: number }>("agenda_business_hours_get", {
      p_tenant_id: tenantId,
    });
    expect(fetched.some((r) => r.day_of_week === dayOfWeek)).toBe(true);
  });

  it("rejects an appointment outside the configured business hours", async () => {
    const { iso, dayOfWeek } = localDatetime(52, 7); // antes das 9h
    await db.as(ownerId).rpc("agenda_business_hours_set", {
      p_tenant_id: tenantId,
      p_hours: JSON.stringify([{ day_of_week: dayOfWeek, opens_at: "09:00", closes_at: "18:00", is_closed: false }]),
    });

    await expectDbError(
      db.as(sellerId).rpc("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: serviceId,
        p_professional_user_id: ownerId,
        p_starts_at: iso,
      }),
      "outside_business_hours",
    );
  });

  it("rejects an appointment on a day marked is_closed", async () => {
    const { iso, dayOfWeek } = localDatetime(53, 10);
    await db.as(ownerId).rpc("agenda_business_hours_set", {
      p_tenant_id: tenantId,
      p_hours: JSON.stringify([{ day_of_week: dayOfWeek, opens_at: null, closes_at: null, is_closed: true }]),
    });

    await expectDbError(
      db.as(sellerId).rpc("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: serviceId,
        p_professional_user_id: ownerId,
        p_starts_at: iso,
      }),
      "outside_business_hours",
    );
  });

  it("allows an appointment inside the configured business hours", async () => {
    const { iso, dayOfWeek } = localDatetime(54, 10);
    await db.as(ownerId).rpc("agenda_business_hours_set", {
      p_tenant_id: tenantId,
      p_hours: JSON.stringify([{ day_of_week: dayOfWeek, opens_at: "09:00", closes_at: "18:00", is_closed: false }]),
    });

    const [row] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_professional_user_id: ownerId,
      p_starts_at: iso,
    });
    expect(row!.agenda_appointment_create).toBeTruthy();
  });

  describe("exceções por profissional", () => {
    it("lets a professional register their own exception without agenda.write", async () => {
      const stylist = await db.addActiveMember(tenantId, "VENDEDOR");
      const { date } = localDatetime(60, 10);

      const [row] = await db
        .as(stylist)
        .rpc<{ agenda_professional_exception_create: string }>("agenda_professional_exception_create", {
          p_tenant_id: tenantId,
          p_professional_user_id: stylist,
          p_date: date,
          p_reason: "Folga",
        });
      expect(row!.agenda_professional_exception_create).toBeTruthy();
    });

    it("refuses registering an exception in someone else's name for someone outside the tenant entirely", async () => {
      // Todo papel seedado (OWNER/ADMIN/GERENTE/VENDEDOR) já tem agenda.write —
      // então o "forbidden" real de hoje é um não-membro tentando agir em nome
      // de outra pessoa, não um membro com papel "fraco" (não existe um).
      const restrictedTenant = await db.createTenantWithOwner("Salão Sem Gestor");
      const stylistB = await db.addActiveMember(restrictedTenant.tenantId, "VENDEDOR");
      const outsider = await db.createUser({ email: "outsider-excecao@example.com" });
      const { date } = localDatetime(61, 10);

      await expectDbError(
        db.as(outsider).rpc("agenda_professional_exception_create", {
          p_tenant_id: restrictedTenant.tenantId,
          p_professional_user_id: stylistB,
          p_date: date,
        }),
        "forbidden",
      );
    });

    it("blocks agenda_appointment_create and ai_agenda_book for that professional on that date, but not other date/professional", async () => {
      const professionalA = await db.addActiveMember(tenantId, "VENDEDOR");
      const professionalB = await db.addActiveMember(tenantId, "VENDEDOR");
      const { iso, date } = localDatetime(70, 10);
      const other = localDatetime(71, 10);

      await db.as(professionalA).rpc("agenda_professional_exception_create", {
        p_tenant_id: tenantId,
        p_professional_user_id: professionalA,
        p_date: date,
      });

      await expectDbError(
        db.as(sellerId).rpc("agenda_appointment_create", {
          p_tenant_id: tenantId,
          p_customer_id: customerId,
          p_service_id: serviceId,
          p_professional_user_id: professionalA,
          p_starts_at: iso,
        }),
        "professional_unavailable",
      );

      // outro profissional, mesmo horário: sem problema
      const [okOther] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: serviceId,
        p_professional_user_id: professionalB,
        p_starts_at: iso,
      });
      expect(okOther!.agenda_appointment_create).toBeTruthy();

      // mesmo profissional, outro dia: sem problema
      const [okOtherDay] = await db
        .as(sellerId)
        .rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
          p_tenant_id: tenantId,
          p_customer_id: customerId,
          p_service_id: serviceId,
          p_professional_user_id: professionalA,
          p_starts_at: other.iso,
        });
      expect(okOtherDay!.agenda_appointment_create).toBeTruthy();

      // ai_agenda_book também respeita a exceção
      const [msgRow] = await db.admin.rpc<{ whatsapp_receive_message: string }>("whatsapp_receive_message", {
        p_tenant_id: tenantId,
        p_whatsapp_number: "11933221100",
        p_content: "Oi",
        p_external_message_id: `agenda-hours-${Date.now()}`,
      });
      void msgRow;
      const [conversation] = await db.admin.query<{ id: string }>(
        `select c.id from public.conversations c join public.customers cu on cu.id = c.customer_id
         where cu.whatsapp = $1 and c.tenant_id = $2`,
        ["11933221100", tenantId],
      );
      await db.as(ownerId).rpc("ai_settings_update", { p_tenant_id: tenantId, p_enabled: true });

      await expectDbError(
        db.admin.rpc("ai_agenda_book", {
          p_conversation_id: conversation!.id,
          p_service_id: serviceId,
          p_professional_user_id: professionalA,
          p_starts_at: iso,
        }),
        "professional_unavailable",
      );
    });

    it("deleting an exception frees the date again immediately", async () => {
      const professional = await db.addActiveMember(tenantId, "VENDEDOR");
      const { iso, date } = localDatetime(80, 10);

      const [created] = await db
        .as(professional)
        .rpc<{ agenda_professional_exception_create: string }>("agenda_professional_exception_create", {
          p_tenant_id: tenantId,
          p_professional_user_id: professional,
          p_date: date,
        });

      await expectDbError(
        db.as(sellerId).rpc("agenda_appointment_create", {
          p_tenant_id: tenantId,
          p_customer_id: customerId,
          p_service_id: serviceId,
          p_professional_user_id: professional,
          p_starts_at: iso,
        }),
        "professional_unavailable",
      );

      await db.as(professional).rpc("agenda_professional_exception_delete", {
        p_id: created!.agenda_professional_exception_create,
      });

      const [row] = await db.as(sellerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_service_id: serviceId,
        p_professional_user_id: professional,
        p_starts_at: iso,
      });
      expect(row!.agenda_appointment_create).toBeTruthy();
    });
  });
});
