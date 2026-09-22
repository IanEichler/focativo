import { formatMoney } from "@/lib/format";

export function UsageCard({ costUsd, isDev }: { costUsd: number; isDev: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-5">
      <p className="text-caption font-semibold text-subtle uppercase">Custo da IA no mês</p>
      <p className="text-title">{formatMoney(costUsd, "USD")}</p>
      {isDev && (
        <p className="text-caption text-subtle">
          Provider de desenvolvimento ativo: nenhuma chamada de IA real é feita, então nenhum custo é registrado.
          Configure <code>ANTHROPIC_API_KEY</code> para usar um modelo real.
        </p>
      )}
    </div>
  );
}
