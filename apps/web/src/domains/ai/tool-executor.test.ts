import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { executeTool } from "./tool-executor";

it("books an evaluation autonomously and confirms the persisted appointment", async () => {
  const rpc = vi.fn(async () => ({ data: "appointment", error: null }));
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: {
        starts_at: "2026-10-01T18:00:00Z",
        notes: "[AVALIAÇÃO PRESENCIAL] Antes da sessão",
        service: { name: "Remoção de Tatuagem" },
        professional: { full_name: "Daniela" },
        tenant: { timezone: "America/Cuiaba" },
      },
    }),
  };
  const result = await executeTool(
    { rpc, from: () => query } as unknown as Parameters<typeof executeTool>[0],
    { tenantId: "tenant", conversationId: "conversation" },
    "book",
    "criar_agendamento",
    {
      service_id: "service",
      professional_user_id: "professional",
      data_hora: "2026-10-01T14:00:00-04:00",
      tipo_atendimento: "avaliacao",
      observacoes: "Antes da sessão",
    },
  );
  expect(result.isError).toBeUndefined();
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "ai_agenda_book",
    expect.objectContaining({ p_notes: "[AVALIAÇÃO PRESENCIAL] Antes da sessão" }),
  );
  expect(JSON.parse(result.content)).toMatchObject({
    appointment_id: "appointment",
    confirmation_text: expect.stringContaining("Avaliação — Remoção de Tatuagem"),
  });
  expect(JSON.parse(result.content).confirmation_text).toContain("14:00");
});

it("keeps unavailable time requests with the AI instead of escalating", async () => {
  const rpc = vi.fn(async () => ({ data: null, error: { message: "outside_business_hours" } }));
  const result = await executeTool(
    { rpc } as unknown as Parameters<typeof executeTool>[0],
    { tenantId: "tenant", conversationId: "conversation" },
    "book",
    "criar_agendamento",
    {
      service_id: "service",
      professional_user_id: "professional",
      data_hora: "2026-10-01T19:00:00-04:00",
    },
  );
  expect(result.isError).toBe(true);
  expect(result.content).toContain("fora do expediente");
  expect(rpc).toHaveBeenCalledTimes(1);
});

it("preserves the confirmed request as a JSON array before escalating an appointment", async () => {
  const rpc = vi.fn(async (name: string) => ({
    data: null,
    error: name === "ai_agenda_book" ? { message: "human_confirmation_required" } : null,
  }));
  const result = await executeTool(
    { rpc } as unknown as Parameters<typeof executeTool>[0],
    { tenantId: "tenant", conversationId: "conversation" },
    "call",
    "criar_agendamento",
    {
      service_id: "service",
      professional_user_id: "professional",
      data_hora: "2026-10-01T14:00:00-04:00",
      observacoes: "Sessão avulsa",
    },
  );
  expect(result.isError).toBeUndefined();
  expect(JSON.parse(result.content)).toEqual({ pending_human_confirmation: true });
  expect(rpc).toHaveBeenCalledWith(
    "ai_upsert_conversation_state",
    expect.objectContaining({
      p_draft_items: [
        {
          type: "appointment_pending",
          human_cleared: false,
          service_id: "service",
          professional_user_id: "professional",
          starts_at: "2026-10-01T18:00:00.000Z",
          notes: "Sessão avulsa",
        },
      ],
    }),
  );
});

it("does not invent a professional name for an unnamed account", async () => {
  const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (data: unknown) => void) =>
      Promise.resolve({
        data: [
          { user_id: "admin", profile: { full_name: null } },
          { user_id: "named", profile: { full_name: " Daniela " } },
        ],
      }).then(resolve),
  };
  const result = await executeTool(
    { from: () => query } as unknown as Parameters<typeof executeTool>[0],
    { tenantId: "tenant", conversationId: "conversation" },
    "call",
    "consultar_profissionais",
    {},
  );
  expect(JSON.parse(result.content)).toEqual([{ professional_user_id: "named", name: "Daniela" }]);
});
