import { cn } from "@/lib/utils";

/** Coluna e card do Kanban (visual). O comportamento de arrastar entra com o CRM. */
export function KanbanColumn({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-secondary/60 p-2", className)}>
      <header className="flex items-center justify-between px-1.5 py-1">
        <h3 className="text-small font-medium text-foreground">{title}</h3>
        <span className="rounded-full bg-card px-2 text-caption text-muted-foreground tabular">{count}</span>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function KanbanCard({
  customer,
  interest,
  value,
  origin,
  lastInteraction,
  className,
}: {
  customer: string;
  interest: string;
  value: React.ReactNode;
  origin: React.ReactNode;
  lastInteraction: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-border-strong",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-body font-medium">{customer}</p>
        <p className="shrink-0 text-small font-medium tabular">{value}</p>
      </div>
      <p className="line-clamp-2 text-small text-muted-foreground">{interest}</p>
      <div className="flex items-center justify-between gap-2 text-caption text-subtle">
        <span>{origin}</span>
        <span>{lastInteraction}</span>
      </div>
    </article>
  );
}
