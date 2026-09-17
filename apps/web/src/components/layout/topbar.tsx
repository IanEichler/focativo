"use client";

import { Menu, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette, type CommandPaletteItem } from "./command-palette";
import { useShell } from "./shell-context";

interface TopbarProps {
  commands: CommandPaletteItem[];
  end?: React.ReactNode;
  context?: React.ReactNode;
}

export function Topbar({ commands, end, context }: TopbarProps) {
  const { collapsed, toggleCollapsed, openMobile } = useShell();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={openMobile} aria-label="Abrir menu">
        <Menu />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden text-muted-foreground lg:inline-flex"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        aria-pressed={collapsed}
      >
        <PanelLeft />
      </Button>
      {context && <div className="hidden min-w-0 items-center gap-2 md:flex">{context}</div>}
      <div className="ml-auto flex items-center gap-2">
        <CommandPalette items={commands} />
        {end}
      </div>
    </header>
  );
}
