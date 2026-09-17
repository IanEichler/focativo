export type OnboardingStepId =
  "account" | "company" | "company_details" | "products" | "stock" | "whatsapp" | "ai" | "test" | "activate";

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  href?: string;
  /** Passos de módulos ainda não implementados não têm link. */
  availability: "available" | "soon";
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "account", title: "Criar conta", description: "Seu acesso pessoal à plataforma.", availability: "available" },
  { id: "company", title: "Criar empresa", description: "Nome e segmento da loja.", availability: "available" },
  {
    id: "company_details",
    title: "Dados da empresa",
    description: "Razão social, documento e contato.",
    href: "/app/configuracoes",
    availability: "available",
  },
  {
    id: "products",
    title: "Cadastrar produtos",
    description: "Catálogo, preços e características.",
    href: "/app/produtos",
    availability: "available",
  },
  {
    id: "stock",
    title: "Configurar estoque",
    description: "Lotes, validade e quantidades.",
    href: "/app/estoque",
    availability: "available",
  },
  { id: "whatsapp", title: "Conectar WhatsApp", description: "Número de atendimento da loja.", availability: "soon" },
  { id: "ai", title: "Configurar IA", description: "Assistente de venda com dados reais.", availability: "soon" },
  {
    id: "test",
    title: "Testar atendimento",
    description: "Simule uma conversa de ponta a ponta.",
    availability: "soon",
  },
  { id: "activate", title: "Ativar operação", description: "Comece a atender seus clientes.", availability: "soon" },
];

export interface OnboardingFacts {
  hasCompany: boolean;
  legalName: string | null;
  document: string | null;
  phone: string | null;
  productCount?: number;
  stockedItemCount?: number;
}

/** Conclusão calculada a partir de dados reais (nunca marcada manualmente). */
export function completedSteps(facts: OnboardingFacts): Set<OnboardingStepId> {
  const done = new Set<OnboardingStepId>(["account"]);
  if (facts.hasCompany) done.add("company");
  if (facts.hasCompany && facts.legalName && facts.document && facts.phone) done.add("company_details");
  if (facts.hasCompany && (facts.productCount ?? 0) > 0) done.add("products");
  if (facts.hasCompany && (facts.stockedItemCount ?? 0) > 0) done.add("stock");
  return done;
}
