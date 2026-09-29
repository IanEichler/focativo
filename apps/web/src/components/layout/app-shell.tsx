"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
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
  const isInbox = usePathname() === "/app/atendimento";

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

      <div className={cn("min-h-dvh bg-background", isInbox && "h-dvh overflow-hidden")}>
        <aside
          className={cn(
            "fixed inset-y-2 left-2 z-30 hidden flex-col overflow-hidden rounded-3xl border border-sidebar-border bg-sidebar shadow-sm transition-[width] duration-200 ease-out will-change-[width] contain-layout lg:flex",
            collapsed ? "w-sidebar-collapsed" : "w-sidebar",
          )}
        >
          <SidebarBody sections={sections} rootHref={rootHref} collapsed={collapsed} footer={sidebarFooter} onToggle={toggleCollapsed} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="gap-0 overflow-hidden rounded-3xl border border-sidebar-border bg-sidebar p-0 data-[side=left]:inset-y-2 data-[side=left]:left-2 data-[side=left]:h-auto data-[side=left]:w-[min(280px,calc(100vw-16px))] data-[side=left]:sm:max-w-[280px]"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">Navegação principal</SheetDescription>
            <ShellContext.Provider value={{ ...state, collapsed: false }}>
              <SidebarBody
                sections={sections}
                rootHref={rootHref}
                collapsed={false}
                footer={sidebarFooter}
                onNavigate={() => setMobileOpen(false)}
                onClose={() => setMobileOpen(false)}
              />
            </ShellContext.Provider>
          </SheetContent>
        </Sheet>

        <div
          className={cn(
            "flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 ease-out will-change-[padding] contain-layout",
            isInbox && "h-dvh overflow-hidden",
            collapsed ? "lg:pl-[calc(var(--spacing-sidebar-collapsed)+16px)]" : "lg:pl-[calc(var(--spacing-sidebar)+16px)]",
          )}
        >
          {topbar}
          {banner}
          <main id="conteudo" tabIndex={-1} className={cn("flex-1 outline-none", isInbox && "min-h-0 overflow-hidden")}>
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
  onToggle,
  onClose,
}: {
  sections: NavSection[];
  rootHref: string;
  collapsed: boolean;
  footer?: React.ReactNode;
  onNavigate?: () => void;
  onToggle?: () => void;
  onClose?: () => void;
}) {
  return (
    <div data-collapsed={collapsed} className="flex h-full min-h-0 flex-col">
      <div className={cn("flex min-h-16 shrink-0 items-center justify-between gap-2 px-3 py-3", collapsed && "flex-col px-0")}>
        <Link
          href={rootHref}
          onClick={onNavigate}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Logo collapsed={collapsed} />
        </Link>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 rounded-xl border-sidebar-border bg-sidebar text-sidebar-foreground shadow-none hover:bg-sidebar-accent focus-visible:ring-sidebar-ring"
          onClick={onClose ?? onToggle}
          aria-label={onClose ? "Fechar menu" : collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          title={onClose ? "Fechar menu" : collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          aria-expanded={!collapsed}
        >
          {onClose ? <X /> : collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <SidebarNav sections={sections} rootHref={rootHref} collapsed={collapsed} onNavigate={onNavigate} />
      </ScrollArea>
      {footer && <div className="shrink-0 border-t border-sidebar-border p-3">{footer}</div>}
    </div>
  );
}
