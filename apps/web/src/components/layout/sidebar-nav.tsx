"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";
import type { NavItem, NavSection } from "./nav-types";

interface SidebarNavProps {
  sections: NavSection[];
  rootHref: string;
  collapsed: boolean;
  onNavigate?: () => void;
}

function isActive(pathname: string, href: string, rootHref: string) {
  if (href === rootHref) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ sections, rootHref, collapsed, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5 px-3 py-4">
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="flex flex-col gap-0.5">
          {section.title && !collapsed && (
            <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wider text-subtle uppercase">
              {section.title}
            </p>
          )}
          {section.title && collapsed && index > 0 && <div className="mx-2.5 mb-1.5 h-px bg-sidebar-border" />}
          {section.items.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              active={isActive(pathname, item.href, rootHref)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarNavItem({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const soon = item.availability === "soon";
  const base = cn(
    "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-body font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    collapsed && "justify-center px-0",
  );

  const content = (
    <>
      <NavIcon
        name={item.icon}
        className={cn(
          "size-[18px] shrink-0",
          active ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      {!collapsed && <span className="truncate">{item.title}</span>}
      {!collapsed && soon && (
        <Badge variant="outline" className="ml-auto h-[18px] px-1.5 text-[10px] font-medium text-subtle">
          Em breve
        </Badge>
      )}
    </>
  );

  const element = soon ? (
    <span
      aria-disabled="true"
      className={cn(base, "cursor-not-allowed text-muted-foreground/70 opacity-70")}
      title={collapsed ? undefined : `${item.title} — disponível em breve`}
    >
      {content}
    </span>
  ) : (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
      )}
    >
      {content}
    </Link>
  );

  if (!collapsed) return element;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{element}</TooltipTrigger>
      <TooltipContent side="right">{soon ? `${item.title} · em breve` : item.title}</TooltipContent>
    </Tooltip>
  );
}
