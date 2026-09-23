import { z } from "zod";
import { emailSchema, passwordSchema } from "@/domains/auth/schemas";
import { CREATE_USER_ROLE_CODES } from "@/domains/users/schemas";
import { PERMISSIONS } from "@/lib/permissions";
import { TENANT_MODULES } from "@/lib/modules";
import { TENANT_SEGMENTS } from "@/domains/tenants/schemas";

const segmentValues = TENANT_SEGMENTS.map((s) => s.value) as [string, ...string[]];

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Mínimo de 2 caracteres.").max(120, "Máximo de 120 caracteres."),
  segment: z.enum(segmentValues, { message: "Selecione o segmento." }).default("general"),
  ownerEmail: emailSchema,
});

export type CreateTenantField = keyof z.input<typeof createTenantSchema>;

const moduleCodes = TENANT_MODULES.map((m) => m.code) as [string, ...string[]];

export const setModuleFlagSchema = z.object({
  tenantId: z.uuid(),
  moduleCode: z.enum(moduleCodes),
  enabled: z.preprocess((value) => value === "true" || value === true, z.boolean()),
});

export type SetModuleFlagField = keyof z.input<typeof setModuleFlagSchema>;

export const AI_MODELS = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (recomendado)" },
  { value: "claude-opus-5", label: "Claude Opus 5 (mais caro, mais capaz)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (mais barato e rápido)" },
] as const;

export const aiPlatformLimitsSchema = z.object({
  tenantId: z.uuid(),
  model: z.enum(AI_MODELS.map((m) => m.value) as [string, ...string[]]),
  maxTokensPerReply: z.coerce.number().int().min(64).max(4096),
  monthlyBudgetUsd: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || !Number.isNaN(Number(value)), "Valor inválido.")
    .transform((value) => (value === undefined ? undefined : Number(value)))
    .refine((value) => value === undefined || value >= 0, "Deve ser positivo."),
});

export type AiPlatformLimitsField = keyof z.input<typeof aiPlatformLimitsSchema>;

export const adminCreateTenantUserSchema = z.object({
  tenantId: z.uuid(),
  fullName: z.string().trim().min(2, "Informe o nome completo.").max(120, "Nome muito longo."),
  email: emailSchema,
  password: passwordSchema,
  roleCode: z.enum(CREATE_USER_ROLE_CODES, { message: "Selecione um perfil válido." }),
});

export type AdminCreateTenantUserField = keyof z.input<typeof adminCreateTenantUserSchema>;

const permissionCodeSchema = z.enum(PERMISSIONS, { message: "Permissão inválida." });

export const adminSetMemberPermissionsSchema = z.object({
  membershipId: z.uuid(),
  overrides: z.array(z.object({ code: permissionCodeSchema, granted: z.boolean() })),
});
