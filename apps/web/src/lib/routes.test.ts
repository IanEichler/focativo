import { describe, expect, it } from "vitest";
import { isGuestOnlyPath, isProtectedPath, ROUTES, safeNextPath } from "./routes";

describe("safeNextPath (open redirect protection)", () => {
  it.each([
    ["/app/usuarios", "/app/usuarios"],
    ["/app/configuracoes?aba=perfil", "/app/configuracoes?aba=perfil"],
    ["/admin/empresas#x", "/admin/empresas#x"],
  ])("accepts internal path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "app/dashboard",
    "/app\r\nSet-Cookie: x=1",
    "",
    undefined,
    null,
  ])("rejects %s", (input) => {
    expect(safeNextPath(input as string | undefined)).toBe(ROUTES.appHome);
  });

  it("uses the provided fallback", () => {
    expect(safeNextPath("//evil.com", "/onboarding")).toBe("/onboarding");
  });
});

describe("route classification", () => {
  it("protects app, admin, onboarding and password reset", () => {
    expect(isProtectedPath("/app")).toBe(true);
    expect(isProtectedPath("/app/dashboard")).toBe(true);
    expect(isProtectedPath("/admin/empresas/1")).toBe(true);
    expect(isProtectedPath("/onboarding")).toBe(true);
    expect(isProtectedPath("/redefinir-senha")).toBe(true);
    expect(isProtectedPath("/application")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
  });

  it("marks guest-only pages", () => {
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/cadastro")).toBe(true);
    expect(isGuestOnlyPath("/recuperar-senha")).toBe(true);
    expect(isGuestOnlyPath("/redefinir-senha")).toBe(false);
  });
});
