/**
 * Módulos habilitáveis por tenant pelo admin master. Cada um trava uma
 * página/rota própria. O tipo de empresa (varejo vs. serviços, escolhido na
 * criação) decide o padrão inicial — varejo desliga "agenda", serviços
 * desliga "catalog"/"inventory"/"reservations"/"sales" — mas o admin master
 * pode religar/desligar qualquer um depois (ver tenant_module_flags).
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
