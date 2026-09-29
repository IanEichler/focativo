import { z } from "zod";
import { normalizeFieldName, type CustomerFieldsInput } from "./field-mapping";

const aliases: Record<string, keyof CustomerFieldsInput> = {
  nome: "name",
  nome_cliente: "name",
  cliente_nome: "name",
  cliente: "name",
  cpf: "document",
  cliente_cpf: "document",
  cnpj: "document",
  documento: "document",
  cpf_cnpj: "document",
  telefone: "phone",
  cliente_telefone: "phone",
  celular: "phone",
  fone: "phone",
  contato: "phone",
  whatsapp: "whatsapp",
  email: "email",
  cliente_email: "email",
  e_mail: "email",
  nascimento: "birthday",
  data_nascimento: "birthday",
  cliente_data_nascimento: "birthday",
  aniversario: "birthday",
  rg: "rg",
  cliente_rg: "rg",
  profissao: "profession",
  cliente_profissao: "profession",
  endereco: "address",
  cliente_endereco: "address",
  cidade_uf: "city_state",
  cliente_cidade_uf: "city_state",
  cep: "postal_code",
  cliente_cep: "postal_code",
};
const labels: Record<keyof CustomerFieldsInput, string> = {
  name: "nome",
  document: "CPF/CNPJ",
  phone: "telefone",
  whatsapp: "WhatsApp",
  email: "e-mail",
  birthday: "data de nascimento",
  rg: "RG",
  profession: "profissão",
  address: "endereço",
  city_state: "cidade/UF",
  postal_code: "CEP",
};

/** Only personal fields belonging to the selected template can reach this mapper. */
export function customerProfileValues(
  fields: Record<string, string>,
  customer: CustomerFieldsInput,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [placeholder, raw] of Object.entries(fields)) {
    const key = aliases[normalizeFieldName(placeholder)];
    if (!key || customer[key]?.trim()) continue;
    let value = raw.trim();
    if (!value || /^[_\s/.-]+$/.test(value)) continue;
    if (["phone", "whatsapp", "document", "postal_code"].includes(key)) value = value.replace(/\D/g, "");
    if (key === "birthday") {
      const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
      if (br) value = `${br[3]}-${br[2]}-${br[1]}`;
    }
    const limits: Partial<Record<keyof CustomerFieldsInput, number>> = {
      name: 160,
      email: 320,
      rg: 30,
      profession: 160,
      address: 500,
      city_state: 160,
    };
    const max = limits[key];
    const invalid =
      !value ||
      (max !== undefined && value.length > max) ||
      (key === "name" && value.length < 2) ||
      (["phone", "whatsapp"].includes(key) && !/^\d{10,15}$/.test(value)) ||
      (key === "document" && !/^(\d{11}|\d{14})$/.test(value)) ||
      (key === "postal_code" && !/^\d{8}$/.test(value)) ||
      (key === "email" && !z.email().safeParse(value).success) ||
      (key === "birthday" && !z.iso.date().safeParse(value).success);
    if (invalid) throw new Error(`Confira o campo ${labels[key]} antes de salvar no perfil da cliente.`);
    if (values[key] && values[key] !== value)
      throw new Error(`Os campos de ${labels[key]} no contrato têm valores diferentes.`);
    values[key] = value;
  }
  return values;
}
