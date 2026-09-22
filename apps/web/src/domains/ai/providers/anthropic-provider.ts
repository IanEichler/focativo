import "server-only";
import type { AIChatParams, AIChatResult, AIContentBlock, AIMessage, AIProvider } from "../provider";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

function toAnthropicMessages(
  messages: AIMessage[],
): { role: "user" | "assistant"; content: string | AnthropicContentBlock[] }[] {
  return messages.map((message) => {
    if (message.role === "user") return { role: "user" as const, content: message.content };
    if (message.role === "assistant") {
      return {
        role: "assistant" as const,
        content: message.content.map((block): AnthropicContentBlock =>
          block.type === "text"
            ? { type: "text", text: block.text }
            : { type: "tool_use", id: block.id, name: block.name, input: block.input },
        ),
      };
    }
    return {
      role: "user" as const,
      content: message.results.map((result): AnthropicContentBlock => ({
        type: "tool_result",
        tool_use_id: result.toolUseId,
        content: result.content,
        is_error: result.isError,
      })),
    };
  });
}

/**
 * Provider real: fala direto com a Messages API da Anthropic (sem SDK — só
 * fetch, para não adicionar uma dependência pesada por uma chamada HTTP só).
 * Gated por ANTHROPIC_API_KEY (get-provider.ts); sem a chave, o app usa o
 * DevAIProvider.
 */
export class AnthropicAIProvider implements AIProvider {
  readonly code = "anthropic";
  readonly isDev = false;

  constructor(private readonly apiKey: string) {}

  async chat(params: AIChatParams): Promise<AIChatResult> {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: toAnthropicMessages(params.messages),
        tools: params.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`anthropic_error:${response.status}:${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      content: AnthropicContentBlock[];
      stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
      usage: { input_tokens: number; output_tokens: number };
    };

    const content: AIContentBlock[] = data.content.map((block) =>
      block.type === "tool_use"
        ? { type: "tool_use", id: block.id!, name: block.name!, input: block.input ?? {} }
        : { type: "text", text: block.text ?? "" },
    );

    return {
      content,
      stopReason: data.stop_reason === "stop_sequence" ? "end_turn" : data.stop_reason,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    };
  }
}
