import "server-only";
import { randomUUID } from "node:crypto";
import type { AIChatParams, AIChatResult, AIProvider } from "../provider";
import { extractSearchQuery } from "../search-query";

const ESCALATE_KEYWORDS = ["atendente", "humano", "reclama", "cancelar", "gerente", "não gostei", "problema"];

interface SearchResult {
  variant_id: string;
  product_name: string;
  variant_name: string;
  current_price: number;
  available_quantity: number;
}

/**
 * Provider de DESENVOLVIMENTO: nenhuma chamada de LLM real, custo zero — mas
 * exercita de verdade o loop de tools (chama buscar_produtos/escalar via a
 * mesma interface que o provider real usaria), só que decidido por regras
 * simples de palavra-chave em vez de um modelo. Nunca chama criar_reserva
 * sozinho (ver tools.ts) — fingir que uma regra de palavra-chave "decidiu"
 * fazer uma reserva real de estoque seria uma demonstração enganosa; esse
 * caminho é exercitado pelos testes de banco e pelo provider real.
 */
export class DevAIProvider implements AIProvider {
  readonly code = "dev";
  readonly isDev = true;

  async chat(params: AIChatParams): Promise<AIChatResult> {
    const last = params.messages.at(-1);

    if (last?.role === "user_tool_results") {
      const priorToolUse = params.messages.at(-2);
      const toolName =
        priorToolUse?.role === "assistant" ? priorToolUse.content.find((b) => b.type === "tool_use")?.name : undefined;
      const result = last.results[0];

      if (toolName === "escalar_para_humano") {
        return textReply("Entendi — vou chamar um atendente para continuar com você por aqui. Já aviso a equipe! 🙂");
      }
      if (toolName === "criar_reserva") {
        return result?.isError
          ? textReply("Não consegui confirmar a reserva agora — vou chamar um atendente para finalizar com você.")
          : textReply("Prontinho, reserva feita! Você pode retirar na loja — qualquer coisa é só chamar por aqui.");
      }

      // buscar_produtos (ou qualquer outra tool futura sem tratamento específico).
      if (result?.isError) {
        return textReply("Não consegui verificar isso agora — vou chamar um atendente para te ajudar melhor.");
      }
      let results: SearchResult[] = [];
      try {
        results = JSON.parse(result?.content ?? "[]") as SearchResult[];
      } catch {
        // conteúdo inesperado — segue com lista vazia.
      }
      if (results.length === 0) {
        return textReply(
          "Não encontrei esse produto no nosso catálogo agora. Posso chamar um atendente para confirmar com você?",
        );
      }
      const lines = results
        .slice(0, 3)
        .map(
          (item) =>
            `• ${item.product_name} ${item.variant_name} — R$ ${item.current_price.toFixed(2)} (${item.available_quantity > 0 ? "em estoque" : "sem estoque"})`,
        );
      return textReply(`Encontrei estas opções:\n${lines.join("\n")}\n\nQuer que eu separe alguma para você?`);
    }

    const text = last?.role === "user" ? last.content.toLowerCase() : "";

    if (ESCALATE_KEYWORDS.some((word) => text.includes(word))) {
      return toolUse("escalar_para_humano", { motivo: "Cliente pediu atendimento humano ou relatou um problema." });
    }

    return toolUse("buscar_produtos", { consulta: last?.role === "user" ? extractSearchQuery(last.content) : "" });
  }
}

function textReply(text: string): AIChatResult {
  return { content: [{ type: "text", text }], stopReason: "end_turn", inputTokens: 0, outputTokens: 0 };
}

function toolUse(name: string, input: Record<string, unknown>): AIChatResult {
  return {
    content: [{ type: "tool_use", id: randomUUID(), name, input }],
    stopReason: "tool_use",
    inputTokens: 0,
    outputTokens: 0,
  };
}
