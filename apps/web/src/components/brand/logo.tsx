import { APP_NAME } from "@/lib/env";
import { cn } from "@/lib/utils";

/** Marca própria: camadas de estoque cuja base vira um balão de conversa. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <rect x="8" y="8.5" width="16" height="3" rx="1.5" className="fill-primary-foreground" opacity=".45" />
      <rect x="8" y="14" width="16" height="3" rx="1.5" className="fill-primary-foreground" opacity=".72" />
      <path
        d="M9.5 19.5h13a1.5 1.5 0 0 1 0 3H14l-3.5 2.75V22.5h-1a1.5 1.5 0 0 1 0-3Z"
        className="fill-primary-foreground"
      />
    </svg>
  );
}

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-foreground">{APP_NAME}</span>}
    </span>
  );
}
