import { describe, expect, it } from "vitest";
import type { AIMessage } from "../provider";
import { toOpenAIMessages } from "./openai-format";

describe("toOpenAIMessages", () => {
  it("prepends a system message built from the system prompt", () => {
    const result = toOpenAIMessages("Você é uma assistente.", []);
    expect(result).toEqual([{ role: "system", content: "Você é uma assistente." }]);
  });

  it("maps a plain user message", () => {
    const messages: AIMessage[] = [{ role: "user", content: "Oi, tudo bem?" }];
    const [, userMessage] = toOpenAIMessages("sys", messages);
    expect(userMessage).toEqual({ role: "user", content: "Oi, tudo bem?" });
  });

  it("maps an assistant text block to content with no tool_calls", () => {
    const messages: AIMessage[] = [{ role: "assistant", content: [{ type: "text", text: "Claro!" }] }];
    const [, assistantMessage] = toOpenAIMessages("sys", messages);
    expect(assistantMessage).toEqual({ role: "assistant", content: "Claro!", tool_calls: undefined });
  });

  it("maps a tool_use block to a tool_calls entry with stringified arguments and null content", () => {
    const messages: AIMessage[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "call-1", name: "consultar_servicos", input: {} }] },
    ];
    const [, assistantMessage] = toOpenAIMessages("sys", messages);
    expect(assistantMessage).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call-1", type: "function", function: { name: "consultar_servicos", arguments: "{}" } }],
    });
  });

  it("expands a user_tool_results message with multiple results into one 'tool' message per result", () => {
    const messages: AIMessage[] = [
      {
        role: "user_tool_results",
        results: [
          { toolUseId: "call-1", content: '[{"name":"Corte"}]' },
          { toolUseId: "call-2", content: "slot_unavailable", isError: true },
        ],
      },
    ];
    const result = toOpenAIMessages("sys", messages);
    expect(result).toEqual([
      { role: "system", content: "sys" },
      { role: "tool", tool_call_id: "call-1", content: '[{"name":"Corte"}]' },
      { role: "tool", tool_call_id: "call-2", content: "Erro: slot_unavailable" },
    ]);
  });
});
