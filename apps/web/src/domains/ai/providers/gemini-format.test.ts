import { describe, expect, it } from "vitest";
import type { AIMessage } from "../provider";
import { toGeminiContents } from "./gemini-format";

describe("toGeminiContents", () => {
  it("maps a plain user message to a user content with a text part", () => {
    const messages: AIMessage[] = [{ role: "user", content: "Oi, tudo bem?" }];
    expect(toGeminiContents(messages)).toEqual([{ role: "user", parts: [{ text: "Oi, tudo bem?" }] }]);
  });

  it("maps an assistant text block to a model content", () => {
    const messages: AIMessage[] = [{ role: "assistant", content: [{ type: "text", text: "Claro!" }] }];
    expect(toGeminiContents(messages)).toEqual([{ role: "model", parts: [{ text: "Claro!" }] }]);
  });

  it("maps a tool_use block to a functionCall with the same id/name/args", () => {
    const messages: AIMessage[] = [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "call-1", name: "consultar_servicos", input: {} }],
      },
    ];
    expect(toGeminiContents(messages)).toEqual([
      { role: "model", parts: [{ functionCall: { id: "call-1", name: "consultar_servicos", args: {} } }] },
    ]);
  });

  it("recovers the tool name for a tool result by looking back at the matching tool_use, even though AIToolResult itself only carries the id", () => {
    const messages: AIMessage[] = [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "call-1", name: "consultar_servicos", input: {} }],
      },
      {
        role: "user_tool_results",
        results: [{ toolUseId: "call-1", content: '[{"name":"Corte"}]' }],
      },
    ];
    const [, functionResponseContent] = toGeminiContents(messages);
    expect(functionResponseContent).toEqual({
      role: "function",
      parts: [
        { functionResponse: { id: "call-1", name: "consultar_servicos", response: { result: '[{"name":"Corte"}]' } } },
      ],
    });
  });

  it("wraps an error tool result under an error key instead of result", () => {
    const messages: AIMessage[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "call-2", name: "criar_agendamento", input: {} }] },
      { role: "user_tool_results", results: [{ toolUseId: "call-2", content: "slot_unavailable", isError: true }] },
    ];
    const [, functionResponseContent] = toGeminiContents(messages);
    expect(functionResponseContent).toEqual({
      role: "function",
      parts: [
        { functionResponse: { id: "call-2", name: "criar_agendamento", response: { error: "slot_unavailable" } } },
      ],
    });
  });

  it("falls back to the toolUseId as the function name when there's no matching preceding tool_use (defensive, should not normally happen)", () => {
    const messages: AIMessage[] = [{ role: "user_tool_results", results: [{ toolUseId: "orphan-id", content: "x" }] }];
    const [content] = toGeminiContents(messages);
    expect(content!.parts[0]!.functionResponse!.name).toBe("orphan-id");
  });
});
