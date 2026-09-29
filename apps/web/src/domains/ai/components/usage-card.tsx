import { formatMoney } from "@/lib/format";

export function UsageCard({ costUsd, isDev }: { costUsd: number; isDev: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-5">
      <p className="text-caption font-semibold text-subtle uppercase">Custo da IA no mês</p>
      <p className="text-title">{formatMoney(costUsd, "USD")}</p>
      {isDev && (
        <div role="status" className="mt-3 rounded-md border border-border bg-muted p-3 text-body-sm">
          <p className="font-semibold">A IA ainda não está pronta para atender</p>
          <p className="mt-1 text-subtle">
            Falta configurar a integração de IA com o administrador. Até a ativação, as novas mensagens no WhatsApp
            conectado serão encaminhadas para atendimento humano. Respostas simuladas ficam restritas ao ambiente de testes.
          </p>
        </div>
      )}
    </div>
  );
}
