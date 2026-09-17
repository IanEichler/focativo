import { describe, expect, it } from "vitest";
import { formatCpfCnpj, isValidCnpj, isValidCpf, isValidCpfOrCnpj, onlyDigits } from "./br-documents";

describe("brazilian documents", () => {
  it("validates CPF check digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("validates CNPJ check digits", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000180")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });

  it("dispatches by length and formats", () => {
    expect(isValidCpfOrCnpj("52998224725")).toBe(true);
    expect(isValidCpfOrCnpj("11222333000181")).toBe(true);
    expect(isValidCpfOrCnpj("1234567890")).toBe(false);
    expect(formatCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(formatCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(onlyDigits("(11) 99999-0000")).toBe("11999990000");
  });
});
