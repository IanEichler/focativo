/**
 * Módulos do sistema. Cada um trava uma página/rota própria. O que vale para
 * a clínica é decidido aqui (CORE_MODULES/RETIRED_MODULES); para os demais,
 * fica o que já estava gravado em tenant_module_flags — não existe mais tela
 * para mudar isso desde que o painel do admin master foi removido.
 */
export const TENANT_MODULES = [
  { code: "catalog", label: "Catálogo de produtos" },
  { code: "inventory", label: "Estoque" },
  { code: "reservations", label: "Reservas" },
  { code: "sales", label: "Vendas (PDV)" },
  { code: "agenda", label: "Agenda de serviços" },
  { code: "crm", label: "CRM" },
  { code: "financial", label: "Financeiro" },
  { code: "whatsapp", label: "WhatsApp e Atendimento" },
  { code: "ai", label: "Assistente de IA" },
  { code: "documents", label: "Documentos" },
] as const;

export type ModuleCode = (typeof TENANT_MODULES)[number]["code"];

/**
 * Módulos desligados no sistema inteiro, independente de tenant_module_flags:
 * o sistema passou a ser de uso exclusivo de uma clínica, que não usa CRM,
 * atendimento por WhatsApp nem assistente de IA. Os dados antigos continuam
 * no banco; só as telas, ações e o recebimento de mensagens ficam bloqueados.
 */
export const RETIRED_MODULES: ReadonlySet<ModuleCode> = new Set<ModuleCode>(["crm", "whatsapp", "ai"]);

/** Sempre ligados para a clínica, mesmo que um registro antigo em tenant_module_flags diga o contrário. */
export const CORE_MODULES: ReadonlySet<ModuleCode> = new Set<ModuleCode>(["agenda", "financial", "documents"]);
