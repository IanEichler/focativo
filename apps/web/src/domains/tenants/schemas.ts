import { z } from "zod";
import { isValidCpfOrCnpj, onlyDigits } from "@/lib/br-documents";

export const TENANT_SEGMENTS = [
  { value: "supplements", label: "Suplementos e nutrição" },
  { value: "cosmetics", label: "Cosméticos e beleza" },
  { value: "pharmacy", label: "Farmácia e saúde" },
  { value: "food", label: "Alimentos e bebidas" },
  { value: "apparel", label: "Moda e vestuário" },
  { value: "pet", label: "Pet shop" },
  { value: "electronics", label: "Eletrônicos" },
  { value: "general", label: "Varejo em geral" },
] as const;

const segmentValues = TENANT_SEGMENTS.map((segment) => segment.value) as [string, ...string[]];

export const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

export const tenantNameSchema = z
  .string({ message: "Informe o nome da empresa." })
  .trim()
  .min(2, "O nome deve ter pelo menos 2 caracteres.")
  .max(120, "O nome deve ter no máximo 120 caracteres.");

export const createTenantSchema = z.object({
  name: tenantNameSchema,
  segment: z.enum(segmentValues, { message: "Selecione o segmento." }),
});

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null));

export const updateTenantSchema = z.object({
  name: tenantNameSchema,
  legalName: optionalText(160, "Razão social muito longa."),
  document: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? onlyDigits(value) : null))
    .refine((value) => value === null || isValidCpfOrCnpj(value), "CPF ou CNPJ inválido."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || z.email().safeParse(value).success, "E-mail inválido."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? onlyDigits(value) : null))
    .refine((value) => value === null || (value.length >= 10 && value.length <= 13), "Telefone inválido."),
  segment: z.enum(segmentValues, { message: "Selecione o segmento." }),
  timezone: z.enum(TIMEZONES, { message: "Fuso horário inválido." }),
});

export const tenantIdSchema = z.uuid({ message: "Empresa inválida." });

export type CreateTenantField = keyof z.input<typeof createTenantSchema>;
export type UpdateTenantField = keyof z.input<typeof updateTenantSchema>;
