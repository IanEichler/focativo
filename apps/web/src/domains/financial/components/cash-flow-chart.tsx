"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { CashFlowMonth } from "../queries";

const HEIGHT = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 64 };
const BAR = 18;
const GAP = 2;
const RADIUS = 4;

function shortMonth(month: string): string {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(new Date(`${month}-15T12:00:00Z`))
    .replace(".", "");
  return `${label}/${month.slice(2, 4)}`;
}

function compactMoney(value: number): string {
  if (value >= 1000) return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(value).toLocaleString("pt-BR")}`;
}

/** Arredonda o topo do eixo para um valor "redondo" e devolve 4 marcas. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 250, 500, 750, 1000];
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw)!;
  return [0, 1, 2, 3, 4].map((index) => index * step);
}

/** Coluna empilhada: base sólida (realizado) e topo hachurado (em aberto/previsto), 4px arredondado só na ponta. */
function StackedColumn({
  x,
  realized,
  open,
  scale,
  baseline,
  color,
  patternId,
}: {
  x: number;
  realized: number;
  open: number;
  scale: (value: number) => number;
  baseline: number;
  color: string;
  patternId: string;
}) {
  const realizedHeight = realized > 0 ? Math.max(scale(realized), 1) : 0;
  const openHeight = open > 0 ? Math.max(scale(open), 1) : 0;
  const total = realizedHeight + openHeight + (realizedHeight && openHeight ? GAP : 0);
  if (total === 0) return null;
  const top = baseline - total;
  const clipId = `${patternId}-clip-${x}`;
  return (
    <g>
      <clipPath id={clipId}>
        <path
          d={`M${x},${baseline} V${top + RADIUS} Q${x},${top} ${x + RADIUS},${top} H${x + BAR - RADIUS} Q${x + BAR},${top} ${x + BAR},${top + RADIUS} V${baseline} Z`}
        />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {realizedHeight > 0 && (
          <rect x={x} y={baseline - realizedHeight} width={BAR} height={realizedHeight} fill={color} />
        )}
        {openHeight > 0 && (
          <>
            <rect x={x} y={top} width={BAR} height={openHeight} fill={color} opacity={0.18} />
            <rect x={x} y={top} width={BAR} height={openHeight} fill={`url(#${patternId})`} />
          </>
        )}
      </g>
    </g>
  );
}

export function CashFlowChart({ months, currentMonth }: { months: CashFlowMonth[]; currentMonth: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.round(entry!.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const totals = months.map((month) => ({
    income: month.incomePaid + month.incomeOpen,
    expense: month.expensePaid + month.expenseOpen,
  }));
  const ticks = niceTicks(Math.max(0, ...totals.flatMap((total) => [total.income, total.expense])));
  const top = ticks[ticks.length - 1]!;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotHeight;
  const scale = (value: number) => (value / top) * plotHeight;
  const groupWidth = BAR * 2 + GAP;
  // Abaixo de ~48px por mês as colunas encostariam: o gráfico rola na horizontal dentro do card.
  const chartWidth = Math.max(width, PAD.left + PAD.right + months.length * 48);
  const band = (chartWidth - PAD.left - PAD.right) / Math.max(months.length, 1);

  const activeMonth = active === null ? null : months[active]!;
  const tooltipLeft =
    active === null ? 0 : Math.min(Math.max(PAD.left + band * active + band / 2, 90), chartWidth - 90);

  return (
    <div className="cash-flow-chart flex flex-col gap-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-small text-muted-foreground" aria-label="Legenda">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm" style={{ background: "var(--flow-in)" }} /> Entradas
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm" style={{ background: "var(--flow-out)" }} /> Saídas
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-muted-foreground" /> Realizado (pago)
        </li>
        <li className="flex items-center gap-1.5">
          <svg aria-hidden width="12" height="12" className="rounded-sm text-muted-foreground">
            <rect width="12" height="12" fill="currentColor" opacity={0.18} />
            <path d="M-2,4 l6,-6 M0,12 l12,-12 M8,14 l6,-6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Em aberto ou previsto
        </li>
      </ul>
      <div ref={containerRef} className="w-full overflow-x-auto overflow-y-hidden pt-1">
        <div className="relative" style={{ width: chartWidth }} onPointerLeave={() => setActive(null)}>
          <svg
            width={chartWidth}
            height={HEIGHT}
            role="img"
            aria-label="Entradas e saídas por mês; os valores estão na tabela abaixo."
            className="block overflow-visible"
          >
            <defs>
              {(["in", "out"] as const).map((kind) => (
                <pattern
                  key={kind}
                  id={`${uid}-${kind}`}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="6" stroke={`var(--flow-${kind})`} strokeWidth="2" />
                </pattern>
              ))}
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={chartWidth - PAD.right}
                  y1={baseline - scale(tick)}
                  y2={baseline - scale(tick)}
                  className="stroke-border"
                  strokeDasharray={tick === 0 ? undefined : "2 4"}
                />
                <text
                  x={PAD.left - 8}
                  y={baseline - scale(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
                >
                  {compactMoney(tick)}
                </text>
              </g>
            ))}
            {months.map((month, index) => {
              const center = PAD.left + band * index + band / 2;
              const x = center - groupWidth / 2;
              const isCurrent = month.month === currentMonth;
              return (
                <g key={month.month}>
                  {isCurrent && (
                    <rect
                      x={PAD.left + band * index}
                      y={PAD.top}
                      width={band}
                      height={plotHeight}
                      className="fill-muted"
                      opacity={0.6}
                    />
                  )}
                  <StackedColumn
                    x={x}
                    realized={month.incomePaid}
                    open={month.incomeOpen}
                    scale={scale}
                    baseline={baseline}
                    color="var(--flow-in)"
                    patternId={`${uid}-in`}
                  />
                  <StackedColumn
                    x={x + BAR + GAP}
                    realized={month.expensePaid}
                    open={month.expenseOpen}
                    scale={scale}
                    baseline={baseline}
                    color="var(--flow-out)"
                    patternId={`${uid}-out`}
                  />
                  <text
                    x={center}
                    y={baseline + 18}
                    textAnchor="middle"
                    className={
                      isCurrent ? "fill-foreground text-[11px] font-medium" : "fill-muted-foreground text-[11px]"
                    }
                  >
                    {shortMonth(month.month)}
                  </text>
                  <rect
                    x={PAD.left + band * index}
                    y={PAD.top}
                    width={band}
                    height={plotHeight}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${shortMonth(month.month)}: entradas ${formatMoney(totals[index]!.income)}, saídas ${formatMoney(totals[index]!.expense)}`}
                    onPointerMove={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    className="outline-none focus-visible:stroke-ring"
                  />
                </g>
              );
            })}
          </svg>
          {activeMonth && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-small shadow-md"
              style={{ left: tooltipLeft }}
            >
              <p className="mb-1.5 font-medium text-foreground">{shortMonth(activeMonth.month)}</p>
              {[
                { label: "Recebido", value: activeMonth.incomePaid, color: "var(--flow-in)" },
                { label: "A receber", value: activeMonth.incomeOpen, color: "var(--flow-in)", dashed: true },
                { label: "Pago", value: activeMonth.expensePaid, color: "var(--flow-out)" },
                { label: "A pagar", value: activeMonth.expenseOpen, color: "var(--flow-out)", dashed: true },
              ].map((row) => (
                <p key={row.label} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <svg aria-hidden width="12" height="4">
                      <line
                        x1="0"
                        y1="2"
                        x2="12"
                        y2="2"
                        stroke={row.color}
                        strokeWidth="2"
                        strokeDasharray={row.dashed ? "3 2" : undefined}
                      />
                    </svg>
                    {row.label}
                  </span>
                  <strong className="font-medium text-foreground tabular">{formatMoney(row.value)}</strong>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
