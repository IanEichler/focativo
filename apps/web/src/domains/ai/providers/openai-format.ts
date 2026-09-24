import type { AIContentBlock, AIMessage } from "../provider";

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/**
 * Ao contrário da Anthropic/Gemini (um bloco por tool_result dentro de UMA
 * mensagem), a Chat Completions API da OpenAI exige uma mensagem "tool"
 * separada por tool_call_id — por isso um `user_tool_results` com N
 * resultados vira N mensagens aqui, nunca uma só.
 */
export function toOpenAIMessages(system: string, messages: AIMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [{ role: "system", content: system }];

  for (const message of messages) {
    if (message.role === "user") {
      result.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      const text = message.content
        .filter((block): block is Extract<AIContentBlock, { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const toolCalls = message.content
        .filter((block): block is Extract<AIContentBlock, { type: "tool_use" }> => block.type === "tool_use")
        .map((block): OpenAIToolCall => ({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        }));
      result.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });
      continue;
    }

    for (const toolResult of message.results) {
      result.push({
        role: "tool",
        tool_call_id: toolResult.toolUseId,
        content: toolResult.isError ? `Erro: ${toolResult.content}` : toolResult.content,
      });
    }
  }

  return result;
}
