import "server-only";
import type { AIToolDefinition } from "./provider";

/**
 * Tools controladas (seção do prompt mestre sobre venda assistida): um
 * conjunto pequeno e auditável de ações, cada uma mapeada para uma RPC
 * própria da IA (nunca as RPCs de staff — veja o comentário no topo da
 * migration da Fase 7). Nenhuma tool executa SQL livre; a IA nunca vê nem
 * escreve fora deste conjunto.
 *
 * O conjunto oferecido ao modelo depende dos módulos do tenant (buildAiTools)
 * — uma empresa de serviços nunca vê "buscar_produtos"/"criar_reserva" (não
 * tem catálogo), e uma empresa de varejo nunca vê as tools de agenda.
 */
const RETAIL_TOOLS: AIToolDefinition[] = [
  {
    name: "buscar_produtos",
    description:
      "Busca produtos no catálogo da loja por texto livre (nome, categoria, marca). Use para responder perguntas sobre disponibilidade, preço ou variações de um produto.",
    inputSchema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Termo de busca, ex.: 'whey chocolate' ou 'creatina'." },
        apenas_em_estoque: { type: "boolean", description: "Se true, mostra só itens com estoque disponível." },
      },
      required: ["consulta"],
    },
  },
  {
    name: "criar_reserva",
    description:
      "Cria uma reserva dos produtos escolhidos para o cliente desta conversa, travando o preço atual e separando o estoque. Use só depois que o cliente confirmar explicitamente o que quer levar — nunca reserve por suposição.",
    inputSchema: {
      type: "object",
      properties: {
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string", description: "id da variação (retornado por buscar_produtos)." },
              quantidade: { type: "number" },
            },
            required: ["variant_id", "quantidade"],
          },
        },
        observacoes: { type: "string" },
      },
      required: ["itens"],
    },
  },
];

const AGENDA_TOOLS: AIToolDefinition[] = [
  {
    name: "consultar_servicos",
    description:
      "Lista os serviços oferecidos (nome, duração, preço, descrição, restrições e se exige confirmação humana antes de agendar). Use para responder dúvidas do cliente sobre o que é oferecido antes de agendar.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "consultar_profissionais",
    description: "Lista os profissionais que atendem, para o cliente escolher com quem quer agendar.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "consultar_horario_atendimento",
    description: "Consulta o horário de funcionamento da empresa por dia da semana. Use antes de sugerir um horário.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "criar_agendamento",
    description:
      "Agenda um horário para o cliente desta conversa. Use só depois que o cliente confirmar serviço, profissional (se houver mais de um) e horário exatos — nunca agende por suposição. Se o horário estiver ocupado ou fora do expediente, a tool falha e você deve sugerir outro horário. Se o serviço exigir confirmação humana, a tool devolve pending_human_confirmation em vez de confirmar — nesse caso avise o cliente que um atendente vai revisar.",
    inputSchema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "id do serviço (retornado por consultar_servicos)." },
        professional_user_id: {
          type: "string",
          description: "id do profissional (retornado por consultar_profissionais).",
        },
        data_hora: { type: "string", description: "Data e hora no formato ISO 8601, ex.: 2026-10-01T14:00:00-03:00." },
        observacoes: { type: "string" },
      },
      required: ["service_id", "professional_user_id", "data_hora"],
    },
  },
];

const FAQ_TOOL: AIToolDefinition = {
  name: "consultar_perguntas_frequentes",
  description:
    "Consulta as perguntas frequentes cadastradas pela empresa. Use quando o cliente perguntar algo genérico sobre o negócio (políticas, formas de pagamento, etc.) antes de responder por conta própria.",
  inputSchema: { type: "object", properties: {} },
};

const ESCALATE_TOOL: AIToolDefinition = {
  name: "escalar_para_humano",
  description:
    "Transfere a conversa para um atendente humano. Use quando o cliente pedir explicitamente para falar com uma pessoa, quando houver uma reclamação, ou quando a pergunta estiver fora do que você consegue resolver com as tools disponíveis.",
  inputSchema: {
    type: "object",
    properties: { motivo: { type: "string" } },
    required: ["motivo"],
  },
};

export function buildAiTools(enabledModules: { catalog: boolean; agenda: boolean }): AIToolDefinition[] {
  return [
    ...(enabledModules.catalog ? RETAIL_TOOLS : []),
    ...(enabledModules.agenda ? AGENDA_TOOLS : []),
    FAQ_TOOL,
    ESCALATE_TOOL,
  ];
}
