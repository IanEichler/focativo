"use client";

import { useEffect, useState, type RefObject } from "react";
import { MoneyValue } from "@/components/data/money-value";
import { contractPaymentPlan, type PaymentPlanResult } from "@/domains/financial/payment-plan";

const POLL_MS = 500;

function readFields(form: HTMLFormElement, fields: string[], autoFilled: Record<string, string>): Record<string, string> {
  const formData = new FormData(form);
  return Object.fromEntries(fields.map((field) => [field, String(formData.get(`field_${field}`) ?? autoFilled[field] ?? "").trim()]));
}

/**
 * Mostra, enquanto o contrato é preenchido, as parcelas que vão para o
 * Financeiro quando ele for assinado — o mesmo cálculo que o servidor congela
 * no contrato. Lê por amostragem pelo mesmo motivo da prévia do documento.
 */
export function ContractPaymentPlan({
  formRef,
  fields,
  autoFilled,
  fallbackDescription,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  fields: string[];
  autoFilled: Record<string, string>;
  fallbackDescription: string;
}) {
  const [launch, setLaunch] = useState(true);
  const [result, setResult] = useState<PaymentPlanResult>({ plan: [] });

  useEffect(() => {
    let last = "";
    const refresh = () => {
      if (!formRef.current) return;
      const next = contractPaymentPlan(readFields(formRef.current, fields, autoFilled), fallbackDescription);
      const snapshot = JSON.stringify(next);
      if (snapshot !== last) {
        last = snapshot;
        setResult(next);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [formRef, fields, autoFilled, fallbackDescription]);

  if (!result.plan.length && !result.problem) return null;

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 font-medium">Parcelas no Financeiro</legend>
      <input type="hidden" name="launchPayments" value={launch ? "true" : "false"} />
      <label className="flex items-center gap-2 text-body">
        <input type="checkbox" checked={launch} onChange={(event) => setLaunch(event.target.checked)} className="size-4" />
        Lançar as parcelas no Financeiro da cliente quando o contrato for assinado
      </label>
      {launch &&
        (result.problem ? (
          <p role="status" className="text-small text-warning">
            {result.problem}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-body">
            {result.plan.map((item) => (
              <li key={item.number} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  {item.count > 1 ? `${item.number}/${item.count}` : "Única"} · vence{" "}
                  {item.dueDate.split("-").reverse().join("/")}
                </span>
                <MoneyValue value={Number(item.amount)} />
              </li>
            ))}
          </ul>
        ))}
      {launch && !result.problem && (
        <p className="text-small text-muted-foreground">
          Uma parcela por mês a partir do vencimento. Depois de assinado, dá para ajustar valor e data de cada parcela na aba
          Financeiro da cliente.
        </p>
      )}
    </fieldset>
  );
}
