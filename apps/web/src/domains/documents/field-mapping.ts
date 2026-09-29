import { formatContractField, normalizeFieldName } from "./field-format";
export { normalizeFieldName } from "./field-format";

export interface CustomerFieldsInput {
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  document: string | null;
  /** ISO (yyyy-mm-dd) ou null. */
  birthday: string | null;
  rg?: string | null;
  profession?: string | null;
  address?: string | null;
  city_state?: string | null;
  postal_code?: string | null;
}

export interface TenantFieldsInput {
  name: string;
  legalName: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
}

export interface MappedFields {
  /** Placeholder (como aparece no modelo) -> valor já resolvido. */
  autoFilled: Record<string, string>;
  /** Placeholders sem valor conhecido — viram campo manual no formulário de geração. */
  remaining: string[];
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

const CUSTOMER_ALIASES: Record<string, (customer: CustomerFieldsInput) => string | null> = {
  nome: (c) => c.name,
  nome_cliente: (c) => c.name,
  cliente_nome: (c) => c.name,
  cliente: (c) => c.name,
  cpf: (c) => c.document,
  cliente_cpf: (c) => c.document,
  cnpj: (c) => c.document,
  documento: (c) => c.document,
  cpf_cnpj: (c) => c.document,
  telefone: (c) => c.whatsapp ?? c.phone,
  cliente_telefone: (c) => c.whatsapp ?? c.phone,
  celular: (c) => c.whatsapp ?? c.phone,
  whatsapp: (c) => c.whatsapp ?? c.phone,
  fone: (c) => c.whatsapp ?? c.phone,
  contato: (c) => c.whatsapp ?? c.phone,
  email: (c) => c.email,
  cliente_email: (c) => c.email,
  e_mail: (c) => c.email,
  nascimento: (c) => (c.birthday ? formatDate(c.birthday) : null),
  data_nascimento: (c) => (c.birthday ? formatDate(c.birthday) : null),
  cliente_data_nascimento: (c) => (c.birthday ? formatDate(c.birthday) : null),
  aniversario: (c) => (c.birthday ? formatDate(c.birthday) : null),
  rg: (c) => c.rg ?? null,
  cliente_rg: (c) => c.rg ?? null,
  profissao: (c) => c.profession ?? null,
  cliente_profissao: (c) => c.profession ?? null,
  endereco: (c) => c.address ?? null,
  cliente_endereco: (c) => c.address ?? null,
  cidade_uf: (c) => c.city_state ?? null,
  cliente_cidade_uf: (c) => c.city_state ?? null,
  cep: (c) => c.postal_code ?? null,
  cliente_cep: (c) => c.postal_code ?? null,
};

const TENANT_ALIASES: Record<string, (tenant: TenantFieldsInput) => string | null> = {
  empresa: (t) => t.legalName ?? t.name,
  empresa_nome: (t) => t.legalName ?? t.name,
  contratada: (t) => t.legalName ?? t.name,
  nome_empresa: (t) => t.legalName ?? t.name,
  empresa_cnpj: (t) => t.document,
  cnpj_empresa: (t) => t.document,
  contratada_cnpj: (t) => t.document,
  empresa_telefone: (t) => t.phone,
  empresa_email: (t) => t.email,
};

const SYSTEM_ALIASES: Record<string, () => string> = {
  data: () => formatDate(new Date().toISOString().slice(0, 10)),
  data_hoje: () => formatDate(new Date().toISOString().slice(0, 10)),
  data_atual: () => formatDate(new Date().toISOString().slice(0, 10)),
};

/**
 * Casa cada placeholder descoberto no modelo com um dado conhecido do
 * cliente/empresa (por um dicionário de apelidos comuns em português, sem
 * acento/maiúscula importando) — o que não bater vira campo manual no
 * formulário de geração (ex.: valor do contrato, serviço, prazo).
 */
export function mapKnownFields(
  placeholders: string[],
  customer: CustomerFieldsInput,
  tenant: TenantFieldsInput,
): MappedFields {
  const autoFilled: Record<string, string> = {};
  const remaining: string[] = [];

  for (const placeholder of placeholders) {
    const key = normalizeFieldName(placeholder);
    const value = CUSTOMER_ALIASES[key]?.(customer) ?? TENANT_ALIASES[key]?.(tenant) ?? SYSTEM_ALIASES[key]?.() ?? null;
    if (value) {
      autoFilled[placeholder] = formatContractField(placeholder, value);
    } else {
      remaining.push(placeholder);
    }
  }

  return { autoFilled, remaining };
}
