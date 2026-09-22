import { z } from "zod";
import { checkboxValue, optionalUuid } from "@/lib/decimal";
import { CUSTOMER_ORIGINS } from "./labels";

const originValues = CUSTOMER_ORIGINS.map((item) => item.value) as [string, ...string[]];

const phone = z
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
    phone,
    whatsapp: phone,
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
    tags: optionalText(500, "Tags muito longas."),
    origin: z
      .string()
      .optional()
      .transform((value) => (value && value !== "__none__" ? value : null))
      .refine((value) => value === null || (originValues as readonly string[]).includes(value), "Origem inválida."),
    responsibleUserId: optionalUuid,
    archived: checkboxValue,
  })
  .refine((data) => Boolean(data.phone || data.whatsapp || data.email), {
    message: "Informe ao menos um contato: telefone, WhatsApp ou e-mail.",
    path: ["phone"],
  });

export type CustomerField = keyof z.input<typeof customerSchema>;

export const customerIdSchema = z.uuid();
