import { z } from "zod";
import { emailSchema } from "@/domains/auth/schemas";
import { ROLE_CODES } from "@/lib/permissions";

export const roleCodeSchema = z.enum(ROLE_CODES, { message: "Selecione um papel válido." });

export const inviteUserSchema = z.object({
  email: emailSchema,
  roleCode: roleCodeSchema,
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
