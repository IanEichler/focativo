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
