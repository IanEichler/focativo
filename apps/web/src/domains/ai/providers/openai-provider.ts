import "server-only";
import type { AIChatParams, AIChatResult, AIContentBlock, AIProvider } from "../provider";
import { toOpenAIMessages, type OpenAIMessage, type OpenAIToolCall } from "./openai-format";

const API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Provider real pra OpenAI: fetch cru na Chat Completions API (mesmo espírito
 * dos providers Anthropic/Gemini — sem SDK pesado só pra uma chamada HTTP).
 * `reasoning_effort: "none"` é obrigatório aqui por dois motivos: (1) sem
 * isso, modelos GPT-5.6+ REJEITAM uma requisição de Chat Completions que
 * inclua tools de function-calling; (2) mesmo gotcha que já vimos ao vivo no
 * Gemini — raciocínio interno consome maxOutputTokens e pode cortar a
 * resposta visível. Atendimento de WhatsApp não precisa de raciocínio
 * profundo, então desligar é estritamente melhor aqui.
 */
export class OpenAIAIProvider implements AIProvider {
  readonly code = "openai";
  readonly isDev = false;

  constructor(private readonly apiKey: string) {}

  async chat(params: AIChatParams): Promise<AIChatResult> {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: params.model,
        max_completion_tokens: params.maxTokens,
        reasoning_effort: "none",
        messages: toOpenAIMessages(params.system, params.messages),
        tools:
          params.tools.length > 0
            ? params.tools.map((tool) => ({
                type: "function",
                function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
              }))
            : undefined,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`openai_error:${response.status}:${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices: {
        message: { content: string | null; tool_calls?: OpenAIToolCall[] };
        finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | string;
      }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const content: AIContentBlock[] = [];
    if (choice?.message.content) content.push({ type: "text", text: choice.message.content });
    for (const toolCall of choice?.message.tool_calls ?? []) {
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.function.name,
        input: parseArguments(toolCall.function.arguments),
      });
    }

    const stopReason =
      choice?.finish_reason === "tool_calls"
        ? "tool_use"
        : choice?.finish_reason === "length"
          ? "max_tokens"
          : "end_turn";

    return {
      content,
      stopReason,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export type { OpenAIMessage };
