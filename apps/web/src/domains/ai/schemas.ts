import { z } from "zod";

export const aiSettingsSchema = z.object({
  enabled: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  systemPrompt: z
    .string()
    .trim()
    .max(4000, "Máximo de 4000 caracteres.")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type AiSettingsField = keyof z.input<typeof aiSettingsSchema>;
