import { describe, expect, it } from "vitest";
import { addMonths, contractPaymentPlan, splitCents } from "./payment-plan";

describe("contractPaymentPlan", () => {
  it("splits the final value into monthly installments from the due date", () => {
    const { plan, problem } = contractPaymentPlan(
      {
        pacote_nome: "Pacote facial",
        valor_final: "1.000,00",
        numero_parcelas: "3",
        vencimento: "31/01/2027",
        forma_pagamento: "Cartão de crédito",
      },
      "Contrato",
    );
    expect(problem).toBeUndefined();
    expect(plan.map((item) => [item.number, item.count, item.amount, item.dueDate])).toEqual([
      [1, 3, "333.34", "2027-01-31"],
      [2, 3, "333.33", "2027-02-28"],
      [3, 3, "333.33", "2027-03-31"],
    ]);
    expect(plan[0]).toMatchObject({ description: "Pacote facial", paymentMethod: "Cartão de crédito" });
  });

  it("uses installment value times count when there is no final value, and falls back for the due date and description", () => {
    const { plan } = contractPaymentPlan(
      {
        valor_final: "____",
        valor_parcela: "150",
        numero_parcelas: "2",
        data_contratacao: "10102026",
        item_1_procedimento: "Laser",
      },
      "Contrato.docx",
    );
    expect(plan.map((item) => [item.amount, item.dueDate, item.description])).toEqual([
      ["150.00", "2026-10-10", "Laser"],
      ["150.00", "2026-11-10", "Laser"],
    ]);
  });

  it("asks for what is missing and ignores templates without money fields", () => {
    expect(contractPaymentPlan({ cliente_nome: "Maria" }, "Contrato")).toEqual({ plan: [] });
    expect(contractPaymentPlan({ valor_final: "", vencimento: "10/10/2026" }, "Contrato").problem).toMatch(
      /valor final/,
    );
    expect(contractPaymentPlan({ valor_final: "100", vencimento: "" }, "Contrato").problem).toMatch(/vencimento/);
    expect(
      contractPaymentPlan({ valor_final: "100", vencimento: "10/10/2026", numero_parcelas: "0" }, "Contrato").problem,
    ).toMatch(/parcelas/);
    expect(
      contractPaymentPlan({ valor_final: "0,05", vencimento: "10/10/2026", numero_parcelas: "10" }, "Contrato").problem,
    ).toMatch(/pequeno/);
  });
});

it("adds months clamped to the end of the month and keeps leftover cents on the first installment", () => {
  expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
  expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
});
