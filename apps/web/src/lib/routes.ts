/** Rotas centrais e regras de redirecionamento compartilhadas (proxy + server). */

export const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/cadastro",
  forgotPassword: "/recuperar-senha",
  resetPassword: "/redefinir-senha",
  authConfirm: "/auth/confirm",
  onboarding: "/onboarding",
  appHome: "/app/dashboard",
  admin: "/admin",
} as const;

const PROTECTED_PREFIXES = ["/app", "/admin", "/onboarding", ROUTES.resetPassword];
const GUEST_ONLY = [ROUTES.login, ROUTES.signup, ROUTES.forgotPassword];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY.some((prefix) => matchesPrefix(pathname, prefix));
}

/**
 * Aceita apenas caminhos internos para o parâmetro `next`, evitando
 * open redirect (ex.: `//evil.com`, `https://…`, `/\evil.com`).
 */
export function safeNextPath(value: string | null | undefined, fallback: string = ROUTES.appHome): string {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
