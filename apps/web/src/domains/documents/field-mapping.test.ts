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
    expect(result.autoFilled).toEqual({ Nome: "Maria Silva", CPF: "123.456.789-00", Telefone: "(11) 98888-7777" });
    expect(result.remaining).toEqual([]);
  });

  it("falls back to whatsapp when phone is missing", () => {
    const customerNoPhone: CustomerFieldsInput = { ...customer, phone: null, whatsapp: "11977776666" };
    const result = mapKnownFields(["telefone"], customerNoPhone, tenant);
    expect(result.autoFilled.telefone).toBe("(11) 97777-6666");
  });

  it("auto-fills tenant/company fields", () => {
    const result = mapKnownFields(["empresa", "empresa_cnpj"], customer, tenant);
    expect(result.autoFilled).toEqual({ empresa: "Daniela Forte Estética LTDA", empresa_cnpj: "11.222.333/0001-44" });
  });

  it("recognizes the customer fields used by the aesthetic contract", () => {
    const result = mapKnownFields(
      ["cliente_nome", "cliente_cpf", "cliente_data_nascimento", "cliente_telefone", "cliente_email", "cliente_rg"],
      customer,
      tenant,
    );
    expect(result.autoFilled).toEqual({
      cliente_nome: "Maria Silva",
      cliente_cpf: "123.456.789-00",
      cliente_data_nascimento: "20/05/1990",
      cliente_telefone: "(11) 98888-7777",
      cliente_email: "maria@example.com",
    });
    expect(result.remaining).toEqual(["cliente_rg"]);
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
