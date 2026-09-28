import { z } from "zod";

export const uploadTemplateSchema = z.object({
  name: z.string().trim().min(2, "Mínimo de 2 caracteres.").max(120, "Máximo de 120 caracteres."),
});

export type UploadTemplateField = keyof z.input<typeof uploadTemplateSchema>;

export const generateDocumentSchema = z.object({
  templateId: z.uuid(),
  customerId: z.uuid(),
  saveToProfile: z.preprocess((value) => value === "true" || value === true || value === "on", z.boolean()),
});

export type GenerateDocumentField = keyof z.input<typeof generateDocumentSchema>;
