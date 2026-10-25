import { parseDecimalBR } from "@/lib/decimal";
import { maskContractDate, normalizeFieldName, validContractDate } from "@/domains/documents/field-format";

/** Uma parcela do contrato, no formato congelado em contract_signatures.payment_plan. */
export type PaymentPlanItem = {
  number: number;
  count: number;
  /** Decimal com ponto e 2 casas, ex.: "350.00" — igual ao que o banco valida. */
  amount: string;
  /** AAAA-MM-DD */
  dueDate: string;
  description: string;
  paymentMethod: string;
};

export type PaymentPlanResult = { plan: PaymentPlanItem[]; problem?: string };

const MONEY_FIELDS = ["valor_final", "valor_parcela"];

function pick(fields: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const entry = Object.entries(fields).find(([field]) => normalizeFieldName(field) === name);
    const value = entry?.[1]?.trim() ?? "";
    // Linhas em branco do modelo ("____") contam como vazio.
    if (value && !/^[_\s/.-]+$/.test(value)) return value;
  }
  return "";
}

function toCents(value: string): number | null {
  const amount = parseDecimalBR(value);
  return amount === null || !Number.isFinite(amount) || amount <= 0 ? null : Math.round(amount * 100);
}

function isoDate(value: string): string {
  const [day, month, year] = maskContractDate(value).split("/");
  return `${year}-${month}-${day}`;
}

/** Soma meses mantendo o dia, limitado ao fim do mês (31/01 + 1 mês = 28/02), como o Postgres. */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Divide em centavos; o que sobra da divisão vai na 1ª parcela. */
export function splitCents(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) => (index === 0 ? base + (totalCents % count) : base));
}

export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Monta as parcelas a partir dos campos do contrato: valor final (ou valor da
 * parcela × parcelas), número de parcelas, 1º vencimento (vencimento, data da
 * contratação ou da assinatura) e forma de pagamento. Modelo sem campo de valor
 * não gera plano nem reclama — nem todo contrato tem parte financeira.
 */
export function contractPaymentPlan(fields: Record<string, string>, fallbackDescription: string): PaymentPlanResult {
  const hasMoneyField = Object.keys(fields).some((field) => MONEY_FIELDS.includes(normalizeFieldName(field)));
  if (!hasMoneyField) return { plan: [] };

  const countText = pick(fields, ["numero_parcelas"]);
  const count = countText ? Number(countText) : 1;
  if (!Number.isInteger(count) || count < 1 || count > 120) {
    return { plan: [], problem: "O número de parcelas precisa ser um inteiro entre 1 e 120." };
  }

  const installmentCents = toCents(pick(fields, ["valor_parcela"]));
  const totalCents =
    toCents(pick(fields, ["valor_final"])) ?? (installmentCents === null ? null : installmentCents * count);
  if (totalCents === null) return { plan: [], problem: "Preencha o valor final do contrato." };
  if (Math.floor(totalCents / count) === 0)
    return { plan: [], problem: "O valor é pequeno demais para tantas parcelas." };

  const dueText = pick(fields, ["vencimento", "data_contratacao", "data_assinatura"]);
  if (!dueText || !validContractDate(dueText)) {
    return { plan: [], problem: "Preencha o vencimento da 1ª parcela (ou a data da contratação)." };
  }
  const firstDue = isoDate(dueText);

  const description = (pick(fields, ["pacote_nome", "item_1_procedimento"]) || fallbackDescription).slice(0, 200);
  const paymentMethod = pick(fields, ["forma_pagamento"]).slice(0, 200);
  const amounts = splitCents(totalCents, count);
  return {
    plan: amounts.map((cents, index) => ({
      number: index + 1,
      count,
      amount: centsToAmount(cents),
      dueDate: addMonths(firstDue, index),
      description: description.trim().length >= 2 ? description.trim() : "Contrato",
      paymentMethod,
    })),
  };
}
