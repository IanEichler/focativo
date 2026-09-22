import { z } from "zod";
import { optionalDecimal, optionalUuid } from "@/lib/decimal";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null));

export const opportunitySchema = z.object({
  id: optionalUuid,
  customerId: z.uuid("Selecione um cliente."),
  title: optionalText(160, "Título muito longo."),
  estimatedValue: optionalDecimal({ label: "Valor estimado", max: 9_999_999_999.99, scale: 2 }),
  responsibleUserId: optionalUuid,
  origin: z
    .string()
    .optional()
    .transform((value) => (value && value !== "__none__" ? value : null)),
  notes: optionalText(2000, "Observações muito longas."),
  expectedAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  variantIds: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return [] as string[];
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) throw new Error();
        return parsed as string[];
      } catch {
        ctx.addIssue({ code: "custom", message: "Produtos inválidos." });
        return z.NEVER;
      }
    }),
});

export type OpportunityField = keyof z.input<typeof opportunitySchema>;

export const opportunityIdSchema = z.uuid();
export const stageIdSchema = z.uuid();

export const stageSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Informe o nome da etapa.").max(60, "Nome muito longo."),
});
export type StageField = keyof z.input<typeof stageSchema>;
