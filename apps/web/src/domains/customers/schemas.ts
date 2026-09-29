import { z } from "zod";
import { checkboxValue, optionalUuid } from "@/lib/decimal";
import { CUSTOMER_ORIGINS } from "./labels";

const originValues = CUSTOMER_ORIGINS.map((item) => item.value) as [string, ...string[]];

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.replace(/\D/g, "") : null))
  .refine((value) => value === null || /^[0-9]{10,15}$/.test(value), "Telefone inválido: use DDD + número.");

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null));

export const customerSchema = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(2, "Informe o nome (mín. 2 caracteres).").max(160, "Nome muito longo."),
    phone: optionalPhone,
    whatsapp: optionalPhone,
    email: z
      .string()
      .trim()
      .max(320)
      .optional()
      .transform((value) => (value ? value : null))
      .refine((value) => value === null || z.email().safeParse(value).success, "E-mail inválido."),
    document: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value.replace(/\D/g, "") : null))
      .refine((value) => value === null || value.length === 11 || value.length === 14, "CPF/CNPJ inválido."),
    birthday: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : null))
      .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Data inválida."),
    notes: optionalText(2000, "Observações muito longas."),
    rg: optionalText(30, "RG muito longo."),
    profession: optionalText(160, "Profissão muito longa."),
    address: optionalText(500, "Endereço muito longo."),
    city_state: optionalText(160, "Cidade/UF muito longa."),
    postal_code: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value.replace(/\D/g, "") : null))
      .refine((value) => value === null || /^\d{8}$/.test(value), "CEP inválido: informe 8 dígitos."),
    tags: optionalText(500, "Tags muito longas."),
    origin: z
      .string()
      .optional()
      .transform((value) => (value && value !== "__none__" ? value : null))
      .refine((value) => value === null || (originValues as readonly string[]).includes(value), "Origem inválida."),
    archived: checkboxValue,
  })
  .superRefine((data, context) => {
    if (!data.id && !data.whatsapp && !data.phone) {
      context.addIssue({ code: "custom", path: ["whatsapp"], message: "Informe o número do WhatsApp." });
    }
  })
  .transform((data) => {
    // One contact in the UI; mirror into the legacy phone column for existing consumers.
    const contact = data.whatsapp ?? data.phone;
    return { ...data, whatsapp: contact, phone: contact };
  });

export type CustomerField = keyof z.input<typeof customerSchema>;

export const customerIdSchema = z.uuid();
