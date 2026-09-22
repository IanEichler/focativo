import { z } from "zod";
import { emailSchema, passwordSchema } from "@/domains/auth/schemas";
import { PERMISSIONS, ROLE_CODES } from "@/lib/permissions";

export const roleCodeSchema = z.enum(ROLE_CODES, { message: "Selecione um papel válido." });

export const inviteUserSchema = z.object({
  email: emailSchema,
  roleCode: roleCodeSchema,
});

// Criação direta (com senha) simplifica pra apenas dois perfis — os demais
// papéis (Proprietário, Gerente) continuam disponíveis só pelo convite.
export const CREATE_USER_ROLE_CODES = ["ADMIN", "VENDEDOR"] as const;
export const createUserSchema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome completo.").max(120, "Nome muito longo."),
  email: emailSchema,
  password: passwordSchema,
  roleCode: z.enum(CREATE_USER_ROLE_CODES, { message: "Selecione um perfil válido." }),
});

export type CreateUserField = keyof z.input<typeof createUserSchema>;

const permissionCodeSchema = z.enum(PERMISSIONS, { message: "Permissão inválida." });

export const setMemberPermissionsSchema = z.object({
  membershipId: z.uuid(),
  overrides: z.array(z.object({ code: permissionCodeSchema, granted: z.boolean() })),
});

export const changeRoleSchema = z.object({
  membershipId: z.uuid(),
  roleCode: roleCodeSchema,
});

export const membershipIdSchema = z.object({
  membershipId: z.uuid(),
});

export const setActiveSchema = z.object({
  membershipId: z.uuid(),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type InviteUserField = keyof z.input<typeof inviteUserSchema>;
