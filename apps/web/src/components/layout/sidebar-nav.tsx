"use client";

import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { updateNavOrderAction } from "@/domains/profile/actions";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";
import type { NavItem, NavSection } from "./nav-types";

interface SidebarNavProps {
  sections: NavSection[];
  rootHref: string;
  collapsed: boolean;
  onNavigate?: () => void;
}

/**
 * Só UM item fica marcado como ativo: o de href mais específico (mais
 * comprido) que bate com a URL atual. Sem isso, "/app/agenda/servicos"
 * marcava "Agenda" (href "/app/agenda", prefixo) E "Serviços" ao mesmo
 * tempo — os dois acesos juntos no menu.
 */
function computeActiveHref(pathname: string, sections: NavSection[], rootHref: string): string | null {
  let best: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const matches =
        item.href === rootHref
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (!best || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}

/**
 * Arrastar reordena só DENTRO de cada seção (cada uma tem seu próprio
 * SortableContext) — a persistência (updateNavOrderAction) roda em
 * background sem bloquear a UI, que já reflete a nova ordem na hora.
 */
export function SidebarNav({ sections: initialSections, rootHref, collapsed, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const [sections, setSections] = useState(initialSections);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const activeHref = computeActiveHref(pathname, sections, rootHref);

  function handleDragEnd(sectionIndex: number) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setSections((prev) => {
        const items = prev[sectionIndex]!.items;
        const oldIndex = items.findIndex((item) => item.href === active.id);
        const newIndex = items.findIndex((item) => item.href === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;

        const next = [...prev];
        next[sectionIndex] = { ...next[sectionIndex]!, items: arrayMove(items, oldIndex, newIndex) };
        startTransition(() => {
          void updateNavOrderAction(next.flatMap((section) => section.items.map((item) => item.href)));
        });
        return next;
      });
    };
  }

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
          <DndContext sensors={sensors} onDragEnd={handleDragEnd(index)}>
            <SortableContext items={section.items.map((item) => item.href)} strategy={verticalListSortingStrategy}>
              {section.items.map((item) => (
                <SortableNavItem
                  key={item.href}
                  item={item}
                  active={item.href === activeHref}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      ))}
    </nav>
  );
}

function SortableNavItem(props: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.href,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={cn(isDragging && "z-10 opacity-70")}>
      <SidebarNavItem {...props} />
    </div>
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
