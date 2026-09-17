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
