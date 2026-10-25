import { formatMoney, formatPercent } from "@/lib/format";
import type { ReportGroup } from "../queries";

/**
 * Lista de barras horizontais (uma série só): rótulo, barra proporcional ao
 * maior valor e o valor escrito ao lado — o número nunca depende da cor.
 */
export function BarList({
  groups,
  tone,
  emptyText,
  countLabel,
}: {
  groups: ReportGroup[];
  tone: "in" | "out";
  emptyText: string;
  countLabel: (count: number) => string;
}) {
  if (groups.length === 0) return <p className="text-small text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...groups.map((group) => group.amount));
  const total = groups.reduce((sum, group) => sum + group.amount, 0);

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group) => (
        <li key={group.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-body">
            <span className="min-w-0 truncate" title={group.label}>
              {group.label}
            </span>
            <span className="shrink-0 font-medium tabular">{formatMoney(group.amount)}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${max > 0 ? Math.max((group.amount / max) * 100, 1) : 0}%`,
                  background: `var(--flow-${tone})`,
                }}
              />
            </div>
            <span className="w-36 shrink-0 text-right text-caption whitespace-nowrap text-muted-foreground tabular">
              {countLabel(group.count)} · {formatPercent(total > 0 ? group.amount / total : 0)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
