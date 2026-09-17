"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/domains/auth/session";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { onlyDigits } from "@/lib/br-documents";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome.").max(120, "Nome muito longo."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? onlyDigits(value) : null))
    .refine((value) => value === null || (value.length >= 10 && value.length <= 13), "Telefone inválido."),
});

export type UpdateProfileField = keyof z.input<typeof updateProfileSchema>;

export async function updateProfileAction(
  _prev: ActionState<UpdateProfileField>,
  formData: FormData,
): Promise<ActionState<UpdateProfileField>> {
  const user = await requireUser();
  const input = formDataToObject(formData);
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", user.id)
    .select("id");

  if (error || !data?.length) {
    logger.warn({ event: "profile.update", status: "error", user_id: user.id, code: error?.code });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }

  revalidatePath("/app", "layout");
  return { status: "success", message: "Perfil atualizado." };
}
