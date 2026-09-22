import { z } from "zod";

export const AI_MODELS = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (recomendado)" },
  { value: "claude-opus-5", label: "Claude Opus 5 (mais caro, mais capaz)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (mais barato e rápido)" },
] as const;

export const aiSettingsSchema = z.object({
  enabled: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  systemPrompt: z
    .string()
    .trim()
    .max(4000, "Máximo de 4000 caracteres.")
    .optional()
    .transform((value) => (value ? value : undefined)),
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

export type AiSettingsField = keyof z.input<typeof aiSettingsSchema>;
