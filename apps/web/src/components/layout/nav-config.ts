import type { ModuleCode } from "@/lib/modules";
import type { NavSection } from "./nav-types";

export const APP_NAV: NavSection[] = [
  { items: [{ title: "Dashboard", href: "/app/dashboard", icon: "dashboard" }] },
  {
    title: "Operação",
    items: [
      {
        title: "Atendimento",
        href: "/app/atendimento",
        icon: "inbox",
        permission: "whatsapp.read",
        module: "whatsapp",
      },
      { title: "CRM", href: "/app/crm", icon: "kanban", permission: "crm.read", module: "crm" },
      { title: "Clientes", href: "/app/clientes", icon: "users-round", permission: "customers.read" },
      { title: "Agenda", href: "/app/agenda", icon: "calendar-days", permission: "agenda.read", module: "agenda" },
      {
        title: "Serviços e Horários",
        href: "/app/agenda/servicos",
        icon: "sliders",
        permission: "agenda.write",
        module: "agenda",
      },
    ],
  },
  {
    title: "Comercial",
    items: [
      { title: "Produtos", href: "/app/produtos", icon: "package", permission: "catalog.read", module: "catalog" },
      { title: "Estoque", href: "/app/estoque", icon: "boxes", permission: "inventory.read", module: "inventory" },
      {
        title: "Reservas",
        href: "/app/reservas",
        icon: "calendar-clock",
        permission: "reservations.read",
        module: "reservations",
      },
      { title: "Vendas", href: "/app/vendas", icon: "receipt", permission: "sales.read", module: "sales" },
    ],
  },
  {
    title: "Gestão",
    items: [
      {
        title: "Financeiro",
        href: "/app/financeiro",
        icon: "wallet",
        permission: "financial.read",
        module: "financial",
      },
      {
        title: "Relatórios",
        href: "/app/relatorios",
        icon: "chart",
        permission: "financial.read",
        module: "financial",
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      {
        title: "WhatsApp",
        href: "/app/whatsapp",
        icon: "whatsapp",
        permission: "tenant.update",
        module: "whatsapp",
      },
      { title: "Assistente de IA", href: "/app/ia", icon: "bot", permission: "tenant.update", module: "ai" },
      { title: "Usuários", href: "/app/usuarios", icon: "users", permission: "users.read" },
      { title: "Configurações", href: "/app/configuracoes", icon: "settings" },
      { title: "Como usar", href: "/app/ajuda", icon: "help" },
    ],
  },
];

export const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { title: "Visão geral", href: "/admin", icon: "dashboard" },
      { title: "Empresas", href: "/admin/empresas", icon: "building" },
      { title: "Assinaturas", href: "/admin/assinaturas", icon: "layers", availability: "soon" },
      { title: "Planos", href: "/admin/planos", icon: "credit-card", availability: "soon" },
      { title: "Pagamentos", href: "/admin/pagamentos", icon: "wallet", availability: "soon" },
      { title: "Uso", href: "/admin/uso", icon: "activity", availability: "soon" },
      { title: "WhatsApps", href: "/admin/whatsapps", icon: "message", availability: "soon" },
      { title: "IA", href: "/admin/ia", icon: "bot", availability: "soon" },
      { title: "Saúde", href: "/admin/saude", icon: "heart-pulse", availability: "soon" },
      { title: "Feature Flags", href: "/admin/feature-flags", icon: "flag", availability: "soon" },
      { title: "Logs", href: "/admin/logs", icon: "scroll", availability: "soon" },
      { title: "Configurações", href: "/admin/configuracoes", icon: "settings", availability: "soon" },
    ],
  },
];

/** Remove itens sem permissão, com módulo desligado pelo admin master, e seções vazias (executado no servidor). */
export function filterNav(
  sections: NavSection[],
  permissions: ReadonlySet<string>,
  hasModule: (module: ModuleCode) => boolean = () => true,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => (!item.permission || permissions.has(item.permission)) && (!item.module || hasModule(item.module)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Reordena os itens DENTRO de cada seção conforme o array salvo (hrefs na
 * ordem desejada) — nunca move item entre seções. Href presente no array
 * salvo mas ausente do nav atual é ignorado (feature removida); href do nav
 * atual ausente do array salvo (feature nova) é anexado ao final da seção,
 * na ordem padrão — nunca some.
 */
export function reorderNav(sections: NavSection[], order: string[] | null): NavSection[] {
  if (!order || order.length === 0) return sections;
  const position = new Map(order.map((href, index) => [href, index]));

  return sections.map((section) => ({
    ...section,
    items: [...section.items].sort((a, b) => {
      const posA = position.get(a.href);
      const posB = position.get(b.href);
      if (posA === undefined && posB === undefined) return 0;
      if (posA === undefined) return 1;
      if (posB === undefined) return -1;
      return posA - posB;
    }),
  }));
}

export function navCommands(sections: NavSection[], group: string) {
  return sections.flatMap((section) =>
    section.items
      .filter((item) => item.availability !== "soon")
      .map((item) => ({ title: item.title, href: item.href, icon: item.icon, group: section.title ?? group })),
  );
}
