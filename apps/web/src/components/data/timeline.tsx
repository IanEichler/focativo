import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  timestamp: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "brand" | "info" | "warning" | "danger";
}

const TONE: Record<NonNullable<TimelineItem["tone"]>, string> = {
  neutral: "bg-secondary text-muted-foreground",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < items.length - 1 && (
            <span aria-hidden="true" className="absolute top-8 bottom-0 left-[13px] w-px bg-border" />
          )}
          <span
            className={cn(
              "relative flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5",
              TONE[item.tone ?? "neutral"],
            )}
          >
            {item.icon ?? <span className="size-1.5 rounded-full bg-current" />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-body font-medium">{item.title}</p>
              <p className="text-caption text-subtle tabular">{item.timestamp}</p>
            </div>
            {item.description && <div className="text-small text-muted-foreground">{item.description}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
