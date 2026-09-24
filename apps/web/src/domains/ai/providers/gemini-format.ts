import type { AIMessage } from "../provider";

export interface GeminiPart {
  text?: string;
  functionCall?: { id?: string; name: string; args: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: "user" | "model" | "function";
  parts: GeminiPart[];
}

/**
 * Cada tool_use do nosso lado vira um functionCall do Gemini, com um id
 * gerado por ele (às vezes) ou por nós (quando ele não manda — API ainda em
 * transição, "call_id" virou obrigatório recentemente pra parear
 * functionCall/functionResponse). AIToolResult (tipo compartilhado com o
 * provider da Anthropic) não carrega o nome da tool — só o toolUseId — então
 * reconstruímos toolUseId -> name aqui dentro, olhando pra trás nas
 * chamadas de tool_use já vistas na própria conversa, em vez de mudar um
 * tipo usado por outro provider por causa de uma exigência só do Gemini.
 */
export function toGeminiContents(messages: AIMessage[]): GeminiContent[] {
  const nameByToolUseId = new Map<string, string>();

  return messages.map((message): GeminiContent => {
    if (message.role === "user") return { role: "user", parts: [{ text: message.content }] };
    if (message.role === "assistant") {
      return {
        role: "model",
        parts: message.content.map((block): GeminiPart => {
          if (block.type === "text") return { text: block.text };
          nameByToolUseId.set(block.id, block.name);
          return { functionCall: { id: block.id, name: block.name, args: block.input } };
        }),
      };
    }
    return {
      role: "function",
      parts: message.results.map((result): GeminiPart => ({
        functionResponse: {
          id: result.toolUseId,
          name: nameByToolUseId.get(result.toolUseId) ?? result.toolUseId,
          response: result.isError ? { error: result.content } : { result: result.content },
        },
      })),
    };
  });
}
