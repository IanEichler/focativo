import { expect, it } from "vitest";
import { contractDateInWords, contractFieldError, formatContractField, maskContractDate, validContractDate } from "./field-format";

it("formats compact and ISO dates without timezone shifts", () => {
  expect(maskContractDate("08042004")).toBe("08/04/2004");
  expect(formatContractField("data_contratacao", "08032004")).toBe("08/03/2004");
  expect(formatContractField("cliente_data_nascimento", "2004-04-08")).toBe("08/04/2004");
  expect(contractDateInWords("2026-09-29")).toBe("29 de setembro de 2026");
});

it("validates complete calendar dates including leap years", () => {
  expect(validContractDate("29/02/2024")).toBe(true);
  for (const invalid of ["29/02/2025", "31/02/2026", "32/01/2026", "01/13/2026", "321", "080320041", "00/00/0000"]) {
    expect(contractFieldError("vencimento", invalid)).toBeTruthy();
    expect(contractDateInWords(invalid)).toBe("");
  }
  expect(contractFieldError("data_assinatura", "")).toBeUndefined();
});

it("formats money without changing whole reais into cents or adding another currency prefix", () => {
  expect(formatContractField("valor_parcela", "3123")).toBe("3.123,00");
  expect(formatContractField("valor_parcela", "3.123,45")).toBe("3.123,45");
  expect(formatContractField("valor_parcela", "R$ 3.123,45")).toBe("3.123,45");
  expect(formatContractField("valor_final", "0")).toBe("0,00");
  expect(contractFieldError("valor_parcela", "-10")).toBeTruthy();
});

it("requires a positive integer installment count and preserves payment method text", () => {
  expect(formatContractField("numero_parcelas", "003")).toBe("3");
  for (const invalid of ["0", "-1", "1.5", "1,5", "abc"]) {
    expect(contractFieldError("numero_parcelas", invalid)).toBeTruthy();
  }
  expect(formatContractField("forma_pagamento", "Pix")).toBe("Pix");
});
