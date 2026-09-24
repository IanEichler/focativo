"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { NavSection } from "./nav-types";
import { SIDEBAR_COOKIE } from "./constants";
import { ShellContext, type ShellState } from "./shell-context";
import { SidebarNav } from "./sidebar-nav";

interface AppShellProps {
  sections: NavSection[];
  rootHref: string;
  defaultCollapsed: boolean;
  sidebarFooter?: React.ReactNode;
  topbar: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  sections,
  rootHref,
  defaultCollapsed,
  sidebarFooter,
  topbar,
  banner,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  const state = useMemo<ShellState>(
    () => ({
      collapsed,
      toggleCollapsed,
      openMobile: () => setMobileOpen(true),
      closeMobile: () => setMobileOpen(false),
    }),
    [collapsed, toggleCollapsed],
  );

  return (
    <ShellContext.Provider value={state}>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      <div className="min-h-dvh bg-background">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out will-change-[width] contain-layout lg:flex",
            collapsed ? "w-sidebar-collapsed" : "w-sidebar",
          )}
        >
          <SidebarBody sections={sections} rootHref={rootHref} collapsed={collapsed} footer={sidebarFooter} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] gap-0 border-sidebar-border bg-sidebar p-0 sm:max-w-[280px]">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">Navegação principal</SheetDescription>
            <ShellContext.Provider value={{ ...state, collapsed: false }}>
              <SidebarBody
                sections={sections}
                rootHref={rootHref}
                collapsed={false}
                footer={sidebarFooter}
                onNavigate={() => setMobileOpen(false)}
              />
            </ShellContext.Provider>
          </SheetContent>
        </Sheet>

        <div
          className={cn(
            "flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 ease-out will-change-[padding] contain-layout",
            collapsed ? "lg:pl-sidebar-collapsed" : "lg:pl-sidebar",
          )}
        >
          {topbar}
          {banner}
          <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}

function SidebarBody({
  sections,
  rootHref,
  collapsed,
  footer,
  onNavigate,
}: {
  sections: NavSection[];
  rootHref: string;
  collapsed: boolean;
  footer?: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <div data-collapsed={collapsed} className="flex h-full min-h-0 flex-col">
      <div className={cn("flex h-14 shrink-0 items-center px-5", collapsed && "justify-center px-0")}>
        <Link
          href={rootHref}
          onClick={onNavigate}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <SidebarNav sections={sections} rootHref={rootHref} collapsed={collapsed} onNavigate={onNavigate} />
      </ScrollArea>
      {footer && <div className="shrink-0 border-t border-sidebar-border p-3">{footer}</div>}
    </div>
  );
}
