import "server-only";
import { randomUUID } from "node:crypto";
import type { AIChatParams, AIChatResult, AIContentBlock, AIProvider } from "../provider";
import { toGeminiContents, type GeminiPart } from "./gemini-format";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Provider real pra Gemini: fetch cru na Generative Language API (mesmo
 * espírito do provider Anthropic — sem SDK pesado só pra uma chamada HTTP).
 * Integração nova (2026-09-24): validar ao vivo antes de confiar 100% no
 * mapeamento de function calling, a API mudou recentemente (id passou a ser
 * usado pra parear functionCall/functionResponse).
 */
export class GeminiAIProvider implements AIProvider {
  readonly code = "gemini";
  readonly isDev = false;

  constructor(private readonly apiKey: string) {}

  async chat(params: AIChatParams): Promise<AIChatResult> {
    const response = await fetch(`${API_BASE}/${params.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: params.system }] },
        contents: toGeminiContents(params.messages),
        tools:
          params.tools.length > 0
            ? [
                {
                  functionDeclarations: params.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                  })),
                },
              ]
            : undefined,
        // thinkingBudget: 0 — sem isso, modelos Gemini 3.x gastam boa parte de
        // maxOutputTokens "pensando" internamente antes de responder (visto ao vivo:
        // 45 de 50 tokens viraram raciocínio invisível), cortando a resposta real pro
        // cliente. Atendimento de WhatsApp não precisa de raciocínio profundo — prioriza
        // ter o limite inteiro disponível pro texto visível.
        generationConfig: { maxOutputTokens: params.maxTokens, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`gemini_error:${response.status}:${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      candidates?: {
        content?: { parts?: GeminiPart[] };
        finishReason?: "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "OTHER";
      }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const content: AIContentBlock[] = parts.map((part) =>
      part.functionCall
        ? {
            type: "tool_use",
            id: part.functionCall.id ?? randomUUID(),
            name: part.functionCall.name,
            input: part.functionCall.args ?? {},
          }
        : { type: "text", text: part.text ?? "" },
    );

    const finishReason = data.candidates?.[0]?.finishReason;
    const stopReason = content.some((block) => block.type === "tool_use")
      ? "tool_use"
      : finishReason === "MAX_TOKENS"
        ? "max_tokens"
        : "end_turn";

    return {
      content,
      stopReason,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
