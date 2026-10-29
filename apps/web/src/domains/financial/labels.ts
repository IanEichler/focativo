import type { FinancialEntryRow } from "./queries";

/** "Parcela 2/3" ou "Parcela única". Fora de módulo "use client" para servir às páginas do servidor também. */
export function installmentLabel(entry: Pick<FinancialEntryRow, "installmentNumber" | "installmentCount">): string {
  return entry.installmentCount > 1 ? `Parcela ${entry.installmentNumber}/${entry.installmentCount}` : "Parcela única";
}
