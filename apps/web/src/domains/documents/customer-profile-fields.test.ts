import { expect, it } from "vitest";
import { customerProfileValues } from "./customer-profile-fields";
import { mapKnownFields, type CustomerFieldsInput } from "./field-mapping";

const customer: CustomerFieldsInput = {
  name: "Maria",
  phone: null,
  whatsapp: null,
  email: null,
  document: null,
  birthday: null,
};

it("normalizes personal data while ignoring prices, company data and signatures", () => {
  expect(
    customerProfileValues(
      {
        cliente_nome: "Outro nome",
        cliente_cpf: "123.456.789-00",
        cliente_telefone: "(65) 99999-1234",
        cliente_email: "maria@example.com",
        cliente_data_nascimento: "20/05/1990",
        cliente_rg: "RG123",
        cliente_profissao: "Professora",
        cliente_endereco: "Rua Exemplo, 10",
        cliente_cidade_uf: "Cuiabá / MT",
        cliente_cep: "78000-000",
        empresa_cnpj: "123",
        valor_final: "299,90",
        data_assinatura: "29/09/2026",
      },
      customer,
    ),
  ).toEqual({
    name: "Outro nome",
    document: "12345678900",
    phone: "65999991234",
    whatsapp: "65999991234",
    email: "maria@example.com",
    birthday: "1990-05-20",
    rg: "RG123",
    profession: "Professora",
    address: "Rua Exemplo, 10",
    city_state: "Cuiabá / MT",
    postal_code: "78000000",
  });
});

it("validates corrections even when the profile already has a value", () => {
  expect(() =>
    customerProfileValues(
      { cliente_email: "inválido", cliente_cpf: "outro", cliente_telefone: "123" },
      { ...customer, email: "original@example.com", document: "12345678900", phone: "65999991234" },
    ),
  ).toThrow("e-mail");
});

it("updates existing personal data and mirrors the unified WhatsApp number", () => {
  expect(customerProfileValues({ cliente_nome: "Nome completo", cliente_email: "novo@example.com", cliente_telefone: "+55 (65) 99999-1234", cliente_rg: "" },
    { ...customer, email: "antigo@example.com", phone: "65988881234", whatsapp: "65988881234", rg: "Não apagar" }))
    .toEqual({ name: "Nome completo", email: "novo@example.com", phone: "5565999991234", whatsapp: "5565999991234" });
  expect(customerProfileValues({ cliente_nome: "Maria" }, customer)).toEqual({});
});

it.each(["31/02/1990", "1990-13-01", "amanhã"])("rejects invalid birthdays: %s", (value) => {
  expect(() => customerProfileValues({ cliente_data_nascimento: value }, customer)).toThrow("data de nascimento");
});

it("ignores blank fields and rejects conflicting aliases", () => {
  expect(customerProfileValues({ cliente_rg: " ", cliente_data_nascimento: "____/____/______" }, customer)).toEqual({});
  expect(() => customerProfileValues({ telefone: "65999991234", cliente_telefone: "65999995678" }, customer)).toThrow(
    "valores diferentes",
  );
});

it("fills the next contract from the extended customer profile", () => {
  const updated = {
    ...customer,
    rg: "RG123",
    profession: "Professora",
    address: "Rua A",
    city_state: "Cuiabá / MT",
    postal_code: "78000000",
  };
  const fields = ["cliente_rg", "cliente_profissao", "cliente_endereco", "cliente_cidade_uf", "cliente_cep"];
  const result = mapKnownFields(fields, updated, {
    name: "Clínica",
    legalName: null,
    document: null,
    email: null,
    phone: null,
  });
  expect(result.remaining).toEqual([]);
  expect(result.autoFilled.cliente_endereco).toBe("Rua A");
  expect(result.autoFilled.cliente_rg).toBe("RG123");
});
