/**
 * Catálogo tipado das permissões. A fonte da verdade é o banco
 * (tabelas permissions/role_permissions); este tipo apenas dá segurança de
 * compilação à UI. A autorização efetiva é SEMPRE feita pelo banco (RLS/RPC).
 */
export const PERMISSIONS = [
  "tenant.update",
  "users.read",
  "users.invite",
  "users.manage",
  "audit.read",
  "catalog.read",
  "catalog.write",
  "catalog.costs",
  "inventory.read",
  "inventory.entry",
  "inventory.adjust",
  "inventory.history",
  "customers.read",
  "customers.write",
  "crm.read",
  "crm.write",
  "reservations.read",
  "reservations.write",
  "sales.read",
  "sales.write",
  "sales.discount",
  "financial.read",
  "whatsapp.read",
  "whatsapp.write",
  "agenda.read",
  "agenda.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_CODES = ["OWNER", "ADMIN", "GERENTE", "VENDEDOR"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  VENDEDOR: "Vendedor",
};

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}

export function hasPermission(granted: ReadonlySet<string> | readonly string[], permission: Permission): boolean {
  return Array.isArray(granted) ? granted.includes(permission) : (granted as ReadonlySet<string>).has(permission);
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  "tenant.update": "Editar dados da empresa",
  "users.read": "Ver usuários",
  "users.invite": "Convidar usuários",
  "users.manage": "Gerenciar usuários (papel, permissões, remover)",
  "audit.read": "Ver histórico de auditoria",
  "catalog.read": "Ver produtos",
  "catalog.write": "Criar e editar produtos",
  "catalog.costs": "Ver custos e margens",
  "inventory.read": "Ver estoque",
  "inventory.entry": "Registrar entradas de estoque",
  "inventory.adjust": "Ajustar contagens de estoque",
  "inventory.history": "Ver histórico de movimentações",
  "customers.read": "Ver clientes",
  "customers.write": "Criar e editar clientes",
  "crm.read": "Ver oportunidades do CRM",
  "crm.write": "Criar e editar oportunidades do CRM",
  "reservations.read": "Ver reservas",
  "reservations.write": "Criar e editar reservas",
  "sales.read": "Ver vendas",
  "sales.write": "Registrar vendas",
  "sales.discount": "Aplicar descontos em vendas",
  "financial.read": "Ver financeiro",
  "whatsapp.read": "Ver conversas do WhatsApp",
  "whatsapp.write": "Responder conversas do WhatsApp",
  "agenda.read": "Ver agenda",
  "agenda.write": "Criar e editar agendamentos",
};

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: Permission[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  { module: "tenant", label: "Empresa", permissions: ["tenant.update"] },
  { module: "users", label: "Usuários", permissions: ["users.read", "users.invite", "users.manage"] },
  { module: "audit", label: "Auditoria", permissions: ["audit.read"] },
  { module: "catalog", label: "Catálogo", permissions: ["catalog.read", "catalog.write", "catalog.costs"] },
  {
    module: "inventory",
    label: "Estoque",
    permissions: ["inventory.read", "inventory.entry", "inventory.adjust", "inventory.history"],
  },
  { module: "customers", label: "Clientes", permissions: ["customers.read", "customers.write"] },
  { module: "crm", label: "CRM", permissions: ["crm.read", "crm.write"] },
  { module: "reservations", label: "Reservas", permissions: ["reservations.read", "reservations.write"] },
  { module: "sales", label: "Vendas", permissions: ["sales.read", "sales.write", "sales.discount"] },
  { module: "financial", label: "Financeiro", permissions: ["financial.read"] },
  { module: "whatsapp", label: "WhatsApp", permissions: ["whatsapp.read", "whatsapp.write"] },
  { module: "agenda", label: "Agenda", permissions: ["agenda.read", "agenda.write"] },
];
