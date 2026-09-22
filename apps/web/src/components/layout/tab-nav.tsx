import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  href: string;
  count?: number;
}

/** Abas como links (estado na URL: compartilhável, funciona sem JavaScript). */
export function TabNav({ items, active, label }: { items: TabItem[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto">
      <div className="flex min-w-max gap-1 border-b border-border px-1">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            scroll={false}
            aria-current={active === item.id ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-body font-medium whitespace-nowrap transition-colors focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active === item.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="rounded-full bg-secondary px-1.5 text-caption text-muted-foreground tabular">
                {item.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function resolveTab<const T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}
