import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  chat: vi.fn(),
  rpc: vi.fn(),
  typing: vi.fn(),
  send: vi.fn(),
  execute: vi.fn(),
  aiDev: false,
  whatsappDev: false,
  history: [] as { direction: string; content: string; status: string }[],
  sessionStartedAt: null as string | null,
  gte: vi.fn(),
  update: vi.fn(),
  tools: [] as { name: string; description: string; inputSchema: object }[],
  responsibleId: null as string | null,
  status: "AI_ACTIVE",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("./pricing", () => ({ estimateCostUsd: () => 0 }));
vi.mock("./tools", () => ({ buildAiTools: () => mock.tools }));
vi.mock("./tool-executor", () => ({ executeTool: mock.execute }));
vi.mock("./get-provider", () => ({ getAIProvider: () => ({ isDev: mock.aiDev, chat: mock.chat }) }));
vi.mock("@/domains/whatsapp/get-provider", () => ({
  getWhatsAppProvider: () => ({ isDev: mock.whatsappDev, setTyping: mock.typing, sendText: mock.send }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mock.rpc,
    from(table: string) {
      const result = () => ({
        data:
          {
            conversations: {
              tenant_id: "tenant",
              customer_id: "customer",
              status: mock.status,
              responsible_user_id: mock.responsibleId,
              ai_session_started_at: mock.sessionStartedAt,
              customer: { whatsapp: null, whatsapp_chat_id: "123456789@lid" },
            },
            customers: { name: "Cliente de teste", whatsapp: null, whatsapp_chat_id: "123456789@lid" },
            tenant_ai_settings: { enabled: true },
            tenants: { name: "Clínica Exemplo" },
            tenant_ai_platform_limits: { provider: "openai", model: "test-model" },
            tenant_module_flags: [],
            messages: [...mock.history],
          }[table] ?? null,
      });
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        gte: (...args: unknown[]) => {
          mock.gte(...args);
          return query;
        },
        update: (...args: unknown[]) => {
          mock.update(...args);
          return query;
        },
        or: () => query,
        order: () => query,
        limit: () => query,
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  }),
}));
import { runAiTurn } from "./agent";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.status = "AI_ACTIVE";
  mock.aiDev = false;
  mock.whatsappDev = false;
  mock.sessionStartedAt = null;
  mock.tools = [];
  mock.responsibleId = null;
  mock.history = [{ direction: "INBOUND", content: "Qual o valor?", status: "SENT" }];
  mock.chat.mockResolvedValue({
    stopReason: "end_turn",
    content: [{ type: "text", text: "A sessão custa R$ 299,90.\n\nVocê prefere manhã ou tarde?" }],
    inputTokens: 10,
    outputTokens: 20,
  });
  mock.rpc.mockImplementation(async (name) => ({ data: name === "ai_message_send" ? "message" : null, error: null }));
  mock.typing.mockResolvedValue(undefined);
  mock.send.mockResolvedValue({ externalMessageId: "sent" });
});
afterEach(() => vi.useRealTimers());

async function complete() {
  const turn = runAiTurn("conversation");
  await vi.runAllTimersAsync();
  await turn;
}

it("only sends a booking confirmation from a persisted receipt", async () => {
  mock.tools = [{ name: "criar_agendamento", description: "", inputSchema: {} }];
  mock.chat.mockResolvedValueOnce({
    stopReason: "tool_use",
    content: [{ type: "tool_use", id: "book", name: "criar_agendamento", input: {} }],
    inputTokens: 1,
    outputTokens: 1,
  });
  mock.execute.mockResolvedValueOnce({
    toolUseId: "book",
    content: JSON.stringify({
      appointment_id: "saved",
      confirmation_text: "Agendamento confirmado: avaliação, 30/09 às 14h, com Daniela.",
    }),
  });
  await complete();
  expect(mock.chat).toHaveBeenCalledTimes(1);
  expect(mock.send.mock.calls[0]?.[2]).toContain("30/09 às 14h");
  expect(mock.rpc.mock.calls.some((args) => args[0] === "ai_escalate_conversation")).toBe(false);
});

it("does not send the unverified 19h confirmation seen in Ian's conversation", async () => {
  mock.tools = [{ name: "criar_agendamento", description: "", inputSchema: {} }];
  mock.chat.mockResolvedValueOnce({
    stopReason: "end_turn",
    content: [{ type: "text", text: "A avaliação ficou para quarta-feira às 19h com Daniela." }],
    inputTokens: 1,
    outputTokens: 1,
  });
  await complete();
  expect(mock.chat).toHaveBeenCalledTimes(2);
  expect(mock.send.mock.calls.some((args) => String(args[2]).includes("ficou para"))).toBe(false);
});

it("shows typing, sends separate bubbles through the stored LID and clears typing", async () => {
  await complete();
  expect(mock.send.mock.calls.map((args) => args[2])).toEqual([
    "A sessão custa R$ 299,90.",
    "Você prefere manhã ou tarde?",
  ]);
  expect(mock.typing.mock.calls[0]).toEqual(["tenant", "", true, "123456789@lid"]);
  expect(mock.typing.mock.calls.at(-1)).toEqual(["tenant", "", false, "123456789@lid"]);
  expect(mock.send.mock.calls.every((args) => args[3] === "123456789@lid")).toBe(true);
  expect(mock.update).toHaveBeenCalledWith({ ai_typing_until: expect.any(String) });
  expect(mock.update).toHaveBeenLastCalledWith({ ai_typing_until: null });
});

it("starts the model history at the new attendance after the previous one was closed", async () => {
  mock.sessionStartedAt = "2026-09-29T18:00:00.000Z";
  await complete();
  expect(mock.gte).toHaveBeenCalledWith("created_at", mock.sessionStartedAt);
});

it("stops an old answer if the conversation closes and reopens while the model is working", async () => {
  mock.chat.mockImplementation(async () => {
    mock.sessionStartedAt = "2026-09-29T18:00:00.000Z";
    return {
      stopReason: "end_turn",
      content: [{ type: "text", text: "Resposta antiga" }],
      inputTokens: 10,
      outputTokens: 10,
    };
  });
  await complete();
  expect(mock.send).not.toHaveBeenCalled();
});

it("does not send the remaining bubbles after a human takes over", async () => {
  mock.send.mockImplementation(async () => {
    mock.status = "HUMAN_ACTIVE";
    return { externalMessageId: "sent" };
  });
  await complete();
  expect(mock.send).toHaveBeenCalledOnce();
  expect(mock.typing.mock.calls.at(-1)?.[2]).toBe(false);
});

it("clears typing when generation fails and escalates to staff", async () => {
  mock.chat.mockRejectedValue(new Error("provider unavailable"));
  await complete();
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.rpc).toHaveBeenCalledWith("ai_escalate_conversation", expect.anything());
  expect(mock.typing.mock.calls.at(-1)?.[2]).toBe(false);
});

it("stops a reply sequence if a message fails to send", async () => {
  mock.send.mockRejectedValue(new Error("offline"));
  await complete();
  expect(mock.send).toHaveBeenCalledOnce();
  expect(mock.rpc).toHaveBeenCalledWith("message_mark_failed", expect.anything());
  expect(mock.typing.mock.calls.at(-1)?.[2]).toBe(false);
});

it.each(["criar_agendamento", "escalar_para_humano"])("acknowledges a successful %s handoff once", async (name) => {
  mock.tools = [{ name, description: "", inputSchema: {} }];
  mock.chat.mockResolvedValueOnce({
    stopReason: "tool_use",
    content: [{ type: "tool_use", id: "handoff", name, input: {} }],
    inputTokens: 1,
    outputTokens: 1,
  });
  mock.execute.mockImplementationOnce(async () => {
    mock.status = "HUMAN_ACTIVE";
    return {
      toolUseId: "handoff",
      content: JSON.stringify(
        name === "criar_agendamento" ? { pending_human_confirmation: true } : { escalated: true },
      ),
    };
  });
  await complete();
  expect(mock.chat).toHaveBeenCalledOnce();
  expect(mock.send).toHaveBeenCalledOnce();
  expect(mock.send.mock.calls[0]![2]).toContain("Encaminhei");
});

it("does not add an automated handoff message after staff has already assumed the conversation", async () => {
  mock.tools = [{ name: "escalar_para_humano", description: "", inputSchema: {} }];
  mock.chat.mockResolvedValueOnce({
    stopReason: "tool_use",
    content: [{ type: "tool_use", id: "handoff", name: "escalar_para_humano", input: {} }],
    inputTokens: 1,
    outputTokens: 1,
  });
  mock.execute.mockImplementationOnce(async () => {
    mock.status = "HUMAN_ACTIVE";
    mock.responsibleId = "staff";
    return { toolUseId: "handoff", content: JSON.stringify({ escalated: true }) };
  });
  await complete();
  expect(mock.send).not.toHaveBeenCalled();
});

it("never sends simulated catalog replies to real WhatsApp when credentials are missing", async () => {
  mock.aiDev = true;
  mock.history = [{ direction: "INBOUND", content: "tarde", status: "SENT" }];
  await complete();
  expect(mock.chat).not.toHaveBeenCalled();
  expect(mock.execute).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.typing).not.toHaveBeenCalled();
  expect(mock.rpc).toHaveBeenCalledWith("ai_escalate_conversation", {
    p_conversation_id: "conversation",
    p_reason: expect.stringContaining("chave do provedor"),
  });
});

it("still allows isolated development simulations", async () => {
  mock.aiDev = true;
  mock.whatsappDev = true;
  await complete();
  expect(mock.chat).toHaveBeenCalledOnce();
  expect(mock.send).toHaveBeenCalledTimes(2);
});

it("keeps the chosen professional and period together with the prior appointment question", async () => {
  mock.history = [
    { direction: "INBOUND", content: "tarde", status: "SENT" },
    { direction: "INBOUND", content: "dani", status: "SENT" },
    {
      direction: "OUTBOUND",
      content: "Qual profissional e qual dia e horário prefere para a avaliação?",
      status: "SENT",
    },
  ];
  await complete();
  const params = mock.chat.mock.calls[0]![0];
  expect(params.messages).toEqual([
    {
      role: "assistant",
      content: [{ type: "text", text: "Qual profissional e qual dia e horário prefere para a avaliação?" }],
    },
    { role: "user", content: "dani\ntarde" },
  ]);
  expect(params.system).toContain("Nome da empresa: Clínica Exemplo.");
  expect(params.system).toContain("Na primeira resposta do atendimento, cumprimente e apresente-se");
});

it("rejects a catalog tool call when that tool is not enabled", async () => {
  mock.chat.mockResolvedValueOnce({
    stopReason: "tool_use",
    content: [{ type: "tool_use", id: "call", name: "buscar_produtos", input: { consulta: "tarde" } }],
    inputTokens: 10,
    outputTokens: 10,
  });
  await complete();
  expect(mock.execute).not.toHaveBeenCalled();
  const messages = mock.chat.mock.calls[1]![0].messages;
  expect(messages.at(-1)).toMatchObject({
    role: "user_tool_results",
    results: [{ toolUseId: "call", isError: true, content: expect.stringContaining("não está habilitada") }],
  });
});
