import { describe, expect, it } from "vitest";
import { mapKnownFields, type CustomerFieldsInput, type TenantFieldsInput } from "./field-mapping";

const customer: CustomerFieldsInput = {
  name: "Maria Silva",
  phone: "11988887777",
  whatsapp: null,
  email: "maria@example.com",
  document: "12345678900",
  birthday: "1990-05-20",
};

const tenant: TenantFieldsInput = {
  name: "Daniela Forte",
  legalName: "Daniela Forte Estética LTDA",
  document: "11222333000144",
  email: "contato@danielaforte.com",
  phone: "11999998888",
};

describe("mapKnownFields", () => {
  it("auto-fills known customer fields regardless of accent/case in the placeholder", () => {
    const result = mapKnownFields(["Nome", "CPF", "Telefone"], customer, tenant);
    expect(result.autoFilled).toEqual({ Nome: "Maria Silva", CPF: "12345678900", Telefone: "11988887777" });
    expect(result.remaining).toEqual([]);
  });

  it("falls back to whatsapp when phone is missing", () => {
    const customerNoPhone: CustomerFieldsInput = { ...customer, phone: null, whatsapp: "11977776666" };
    const result = mapKnownFields(["telefone"], customerNoPhone, tenant);
    expect(result.autoFilled.telefone).toBe("11977776666");
  });

  it("auto-fills tenant/company fields", () => {
    const result = mapKnownFields(["empresa", "empresa_cnpj"], customer, tenant);
    expect(result.autoFilled).toEqual({ empresa: "Daniela Forte Estética LTDA", empresa_cnpj: "11222333000144" });
  });

  it("formats a birthday placeholder as dd/mm/yyyy", () => {
    const result = mapKnownFields(["data_nascimento"], customer, tenant);
    expect(result.autoFilled.data_nascimento).toBe("20/05/1990");
  });

  it("leaves unknown placeholders as remaining, with nothing auto-filled for them", () => {
    const result = mapKnownFields(["valor_contrato", "servico"], customer, tenant);
    expect(result.remaining).toEqual(["valor_contrato", "servico"]);
    expect(result.autoFilled).toEqual({});
  });

  it("auto-fills today's date for a system alias", () => {
    const result = mapKnownFields(["data"], customer, tenant);
    expect(result.autoFilled.data).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});
