import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export function MoneyValue({
  value,
  currency = "BRL",
  className,
}: {
  value: number;
  currency?: string;
  className?: string;
}) {
  return <span className={cn("tabular", className)}>{formatMoney(value, currency)}</span>;
}

/**
 * Variação percentual. Não depende só de cor: seta + sinal + texto acessível.
 * `value` é fração (0.124 = +12,4%). `positiveIsGood=false` inverte a semântica (ex.: custo).
 */
export function PercentageChange({
  value,
  positiveIsGood = true,
  className,
}: {
  value: number;
  positiveIsGood?: boolean;
  className?: string;
}) {
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const good = direction === "flat" ? null : (direction === "up") === positiveIsGood;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const label = direction === "up" ? "aumento de" : direction === "down" ? "queda de" : "sem variação";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-small font-medium tabular",
        good === true && "text-success",
        good === false && "text-danger",
        good === null && "text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      {formatPercent(Math.abs(value))}
    </span>
  );
}
