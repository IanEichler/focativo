import { describe, expect, it } from "vitest";
import { ADMIN_NAV, APP_NAV, filterNav, navCommands, reorderNav } from "./nav-config";
import type { NavSection } from "./nav-types";

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

describe("reorderNav", () => {
  const sections: NavSection[] = [
    {
      title: "Operação",
      items: [
        { title: "A", href: "/a", icon: "dashboard" },
        { title: "B", href: "/b", icon: "dashboard" },
        { title: "C", href: "/c", icon: "dashboard" },
      ],
    },
    {
      title: "Comercial",
      items: [
        { title: "D", href: "/d", icon: "dashboard" },
        { title: "E", href: "/e", icon: "dashboard" },
      ],
    },
  ];

  it("returns sections unchanged when there is no saved order", () => {
    expect(reorderNav(sections, null)).toBe(sections);
  });

  it("reorders items within a section according to the saved order", () => {
    const result = reorderNav(sections, ["/c", "/a", "/b"]);
    expect(result[0]!.items.map((i) => i.href)).toEqual(["/c", "/a", "/b"]);
  });

  it("never moves an item across sections, even if the saved order interleaves hrefs from different sections", () => {
    const result = reorderNav(sections, ["/e", "/c", "/d", "/a", "/b"]);
    expect(result[0]!.items.map((i) => i.href)).toEqual(["/c", "/a", "/b"]);
    expect(result[1]!.items.map((i) => i.href)).toEqual(["/e", "/d"]);
  });

  it("appends a nav item that is new (not present in the saved order) to the end of its section", () => {
    const result = reorderNav(sections, ["/b", "/a"]);
    expect(result[0]!.items.map((i) => i.href)).toEqual(["/b", "/a", "/c"]);
  });

  it("silently drops hrefs from the saved order that no longer exist in the current nav", () => {
    const result = reorderNav(sections, ["/removed", "/c", "/b", "/a"]);
    expect(result[0]!.items.map((i) => i.href)).toEqual(["/c", "/b", "/a"]);
  });
});
