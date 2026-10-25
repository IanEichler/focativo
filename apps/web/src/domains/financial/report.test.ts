import { expect, it } from "vitest";
import { entriesToCsv, reportRange } from "./report";

it("resolves report periods from the clinic's today", () => {
  expect(reportRange("mes", "2026-10-24")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  expect(reportRange("mes-anterior", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  expect(reportRange("3m", "2026-10-24")).toEqual({ from: "2026-08-01", to: "2026-10-31" });
  expect(reportRange("ano", "2026-10-24")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  expect(reportRange("12m", "2026-10-24")).toEqual({ from: "2025-11-01", to: "2026-10-31" });
});

it("writes an Excel-friendly CSV with escaping and formula protection", () => {
  const csv = entriesToCsv([
    {
      kind: "INCOME", customerName: "Maria; Silva", description: 'Pacote "facial"', category: null, installmentNumber: 2,
      installmentCount: 6, dueDate: "2026-10-05", amount: 1234.5, status: "PAID", paidAt: "2026-10-06", paymentMethod: "Pix", origin: "Contrato",
    },
    {
      kind: "EXPENSE", customerName: null, description: "=HYPERLINK()", category: "Aluguel", installmentNumber: 1,
      installmentCount: 1, dueDate: "2026-10-10", amount: 2500, status: "PENDING", paidAt: null, paymentMethod: null, origin: "Despesa fixa",
    },
  ]);
  const lines = csv.replace("﻿", "").trim().split("\r\n");
  expect(csv.startsWith("﻿")).toBe(true);
  expect(lines[0]).toBe("Tipo;Cliente;Descrição;Categoria;Parcela;Vencimento;Valor;Situação;Pago em;Forma de pagamento;Origem");
  expect(lines[1]).toBe('Receita;"Maria; Silva";"Pacote ""facial""";;2/6;05/10/2026;1234,50;Pago;06/10/2026;Pix;Contrato');
  expect(lines[2]).toBe("Despesa;;'=HYPERLINK();Aluguel;1/1;10/10/2026;2500,00;Em aberto;;;Despesa fixa");
});
