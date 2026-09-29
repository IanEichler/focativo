import { maskCpfCnpj, maskPhone, maskPostalCode } from "@/lib/masks";
import { parseDecimalBR } from "@/lib/decimal";

export function normalizeFieldName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function contractFieldKind(field: string) {
  const key = normalizeFieldName(field);
  if (["cpf", "cliente_cpf", "cnpj", "documento", "cpf_cnpj", "empresa_cnpj", "cnpj_empresa", "contratada_cnpj"].includes(key)) return "document";
  if (["telefone", "cliente_telefone", "celular", "whatsapp", "fone", "contato", "empresa_telefone"].includes(key)) return "phone";
  if (["cep", "cliente_cep"].includes(key)) return "postal_code";
  if (["endereco", "cliente_endereco"].includes(key)) return "address";
  if (["cidade_uf", "cliente_cidade_uf"].includes(key)) return "city_state";
  if (["cliente_data_nascimento", "data_nascimento", "nascimento", "aniversario", "data_contratacao", "data_assinatura", "vencimento", "data", "data_hoje", "data_atual"].includes(key) || /^sessao_\d+_data$/.test(key)) return "date";
  if (["valor_bruto", "valor_final", "valor_parcela"].includes(key) || /^item_\d+_valor_(sessao|total)$/.test(key)) return "money";
  if (key === "numero_parcelas") return "integer";
  return null;
}

export function contractFieldMask(field: string) {
  switch (contractFieldKind(field)) {
    case "document": return maskCpfCnpj;
    case "phone": return maskPhone;
    case "postal_code": return maskPostalCode;
    default: return undefined;
  }
}

/** Format complete values for preview and export without truncating invalid input or blank lines. */
export function formatContractField(field: string, value: string): string {
  const digits = value.replace(/\D/g, "");
  const kind = contractFieldKind(field);
  if (kind === "document" && /^(\d{11}|\d{14})$/.test(digits)) return maskCpfCnpj(value);
  if (kind === "phone" && /^\d{10,15}$/.test(digits)) return maskPhone(value);
  if (kind === "postal_code" && /^\d{8}$/.test(digits)) return maskPostalCode(value);
  if (kind === "date" && validContractDate(value)) return maskContractDate(value);
  if (kind === "money") {
    const amount = parseDecimalBR(value);
    if (amount !== null && Number.isFinite(amount) && amount >= 0) {
      return amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  if (kind === "integer" && /^\d+$/.test(value) && Number(value) > 0) return String(Number(value));
  return value;
}

export function maskContractDate(raw: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

export function validContractDate(value: string): boolean {
  if (!/^(\d{8}|\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/.test(value)) return false;
  const [day, month, year] = maskContractDate(value).split("/").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function contractDateInWords(value: string): string {
  if (!validContractDate(value)) return "";
  const [day, month, year] = maskContractDate(value).split("/").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export function contractFieldError(field: string, value: string): string | undefined {
  if (!value.trim() || /^[_\s/.-]+$/.test(value)) return undefined;
  const kind = contractFieldKind(field);
  if (kind === "date" && !validContractDate(value)) return "Informe uma data válida no formato DD/MM/AAAA.";
  if (kind === "money") {
    const amount = parseDecimalBR(value);
    if (amount === null || !Number.isFinite(amount) || amount < 0) return "Informe um valor válido em reais.";
  }
  if (kind === "integer" && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)) {
    return "Informe um número inteiro de parcelas, a partir de 1.";
  }
  return undefined;
}

export function formatContractFields(data: Record<string, string>): Record<string, string> {
  const result = Object.fromEntries(Object.entries(data).map(([field, value]) => [field, formatContractField(field, value)]));
  const signatureDate = Object.entries(data).find(([field]) => normalizeFieldName(field) === "data_assinatura")?.[1];
  const words = signatureDate ? contractDateInWords(signatureDate) : "";
  if (words) {
    for (const field of Object.keys(result)) {
      if (normalizeFieldName(field) === "data_assinatura_extenso") result[field] = words;
    }
  }
  return result;
}
