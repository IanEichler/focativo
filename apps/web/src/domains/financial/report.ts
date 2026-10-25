import { formatDay, monthRange, shiftMonth } from "./period";

export const REPORT_PERIODS = [
  { value: "mes", label: "Este mês" },
  { value: "mes-anterior", label: "Mês passado" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "ano", label: "Este ano" },
  { value: "12m", label: "Últimos 12 meses" },
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number]["value"];

/** Intervalo (AAAA-MM-DD) do período escolhido, contado a partir de hoje no fuso da clínica. */
export function reportRange(period: ReportPeriod, today: string): { from: string; to: string } {
  const month = today.slice(0, 7);
  switch (period) {
    case "mes":
      return monthRange(month);
    case "mes-anterior":
      return monthRange(shiftMonth(month, -1));
    case "3m":
      return { from: monthRange(shiftMonth(month, -2)).from, to: monthRange(month).to };
    case "6m":
      return { from: monthRange(shiftMonth(month, -5)).from, to: monthRange(month).to };
    case "ano":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "12m":
      return { from: monthRange(shiftMonth(month, -11)).from, to: monthRange(month).to };
  }
}

export type ExportEntry = {
  kind: "INCOME" | "EXPENSE";
  customerName: string | null;
  description: string;
  category: string | null;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amount: number;
  status: "PENDING" | "PAID" | "CANCELED";
  paidAt: string | null;
  paymentMethod: string | null;
  origin: string;
};

const STATUS_LABELS = { PENDING: "Em aberto", PAID: "Pago", CANCELED: "Cancelado" } as const;

function cell(value: string): string {
  // Proteção contra fórmula ao abrir no Excel (=, +, -, @ no início).
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV no padrão do Excel em português: separador ";", vírgula decimal e BOM para acentos. */
export function entriesToCsv(entries: ExportEntry[]): string {
  const header = [
    "Tipo",
    "Cliente",
    "Descrição",
    "Categoria",
    "Parcela",
    "Vencimento",
    "Valor",
    "Situação",
    "Pago em",
    "Forma de pagamento",
    "Origem",
  ];
  const rows = entries.map((entry) => [
    entry.kind === "INCOME" ? "Receita" : "Despesa",
    entry.customerName ?? "",
    entry.description,
    entry.category ?? "",
    `${entry.installmentNumber}/${entry.installmentCount}`,
    formatDay(entry.dueDate),
    entry.amount.toFixed(2).replace(".", ","),
    STATUS_LABELS[entry.status],
    entry.paidAt ? formatDay(entry.paidAt) : "",
    entry.paymentMethod ?? "",
    entry.origin,
  ]);
  return `﻿${[header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}
