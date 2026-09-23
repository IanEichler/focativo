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

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : undefined));

export const aiBusinessInfoSchema = z.object({
  businessDescription: optionalText(2000, "Máximo de 2000 caracteres."),
  generalPolicies: optionalText(2000, "Máximo de 2000 caracteres."),
  // JSON-encoded arrays (mesmo padrão de professionalUserIds em agenda/schemas.ts).
  faq: z
    .string()
    .transform((value, ctx) => {
      try {
        const parsed = JSON.parse(value || "[]");
        const result = z
          .array(z.object({ question: z.string().trim().min(1).max(200), answer: z.string().trim().min(1).max(500) }))
          .max(20)
          .safeParse(parsed);
        if (!result.success) throw new Error();
        return result.data;
      } catch {
        ctx.addIssue({ code: "custom", message: "Perguntas frequentes inválidas." });
        return z.NEVER;
      }
    })
    .default([]),
  screeningFlow: z
    .string()
    .transform((value, ctx) => {
      try {
        const parsed = JSON.parse(value || "[]");
        const result = z.array(z.string().trim().min(1).max(200)).max(12).safeParse(parsed);
        if (!result.success) throw new Error();
        return result.data;
      } catch {
        ctx.addIssue({ code: "custom", message: "Ordem de triagem inválida." });
        return z.NEVER;
      }
    })
    .default([]),
});

export type AiBusinessInfoField = keyof z.input<typeof aiBusinessInfoSchema>;
