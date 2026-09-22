import { describe, expect, it } from "vitest";
import { ADMIN_NAV, APP_NAV, filterNav, navCommands } from "./nav-config";

describe("navigation", () => {
  it("hides items without permission and drops empty sections", () => {
    const sellerNav = filterNav(APP_NAV, new Set());
    const hrefs = sellerNav.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).not.toContain("/app/usuarios");
    expect(hrefs).toContain("/app/configuracoes");

    const ownerNav = filterNav(APP_NAV, new Set(["users.read"]));
    expect(ownerNav.flatMap((section) => section.items.map((item) => item.href))).toContain("/app/usuarios");
  });

  it("never exposes unavailable modules in the command palette", () => {
    // ADMIN_NAV ainda tem itens "soon" (Assinaturas, Planos...); APP_NAV não
    // tem mais nenhum desde que Relatórios (Fase 8) ficou real.
    const commands = navCommands(ADMIN_NAV, "Administração");
    const soon = ADMIN_NAV.flatMap((section) =>
      section.items.filter((item) => item.availability === "soon").map((item) => item.href),
    );
    expect(soon.length).toBeGreaterThan(0);
    for (const href of soon) {
      expect(commands.map((command) => command.href)).not.toContain(href);
    }
  });
});
