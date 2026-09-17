import type { NavSection } from "./nav-types";

export const APP_NAV: NavSection[] = [
  { items: [{ title: "Dashboard", href: "/app/dashboard", icon: "dashboard" }] },
  {
    title: "Operação",
    items: [
      { title: "Atendimento", href: "/app/atendimento", icon: "inbox", availability: "soon" },
      { title: "CRM", href: "/app/crm", icon: "kanban", availability: "soon" },
      { title: "Clientes", href: "/app/clientes", icon: "users-round", availability: "soon" },
    ],
  },
  {
    title: "Comercial",
    items: [
      { title: "Produtos", href: "/app/produtos", icon: "package", permission: "catalog.read" },
      { title: "Estoque", href: "/app/estoque", icon: "boxes", permission: "inventory.read" },
      { title: "Reservas", href: "/app/reservas", icon: "calendar-clock", availability: "soon" },
      { title: "Vendas", href: "/app/vendas", icon: "receipt", availability: "soon" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { title: "Financeiro", href: "/app/financeiro", icon: "wallet", availability: "soon" },
      { title: "Relatórios", href: "/app/relatorios", icon: "chart", availability: "soon" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { title: "WhatsApp", href: "/app/whatsapp", icon: "message", availability: "soon" },
      { title: "Usuários", href: "/app/usuarios", icon: "users", permission: "users.read" },
      { title: "Configurações", href: "/app/configuracoes", icon: "settings" },
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

/** Remove itens sem permissão e seções vazias (executado no servidor). */
export function filterNav(sections: NavSection[], permissions: ReadonlySet<string>): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || permissions.has(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}

export function navCommands(sections: NavSection[], group: string) {
  return sections.flatMap((section) =>
    section.items
      .filter((item) => item.availability !== "soon")
      .map((item) => ({ title: item.title, href: item.href, icon: item.icon, group: section.title ?? group })),
  );
}
