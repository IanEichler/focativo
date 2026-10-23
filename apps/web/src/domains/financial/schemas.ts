import { z } from "zod";
import { requiredDecimal } from "@/lib/decimal";

const isoDate = (message: string) =>
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, message).refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00Z`)), message);

const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo de ${max} caracteres.`).optional().transform((value) => (value ? value : null));

const description = z.string().trim().min(2, "Mínimo de 2 caracteres.").max(200, "Máximo de 200 caracteres.");
const amount = (label: string) => requiredDecimal({ label, min: 0.01, max: 9_999_999_999.99, scale: 2 });

export const createEntrySchema = z.object({
  customerId: z.uuid("Selecione a cliente."),
  description,
  total: amount("Valor total"),
  installments: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo de 1 parcela.").max(120, "Máximo de 120 parcelas."),
  firstDueDate: isoDate("Informe o 1º vencimento."),
  paymentMethod: optionalText(200),
  notes: optionalText(1000),
});
export type CreateEntryField = keyof z.input<typeof createEntrySchema>;

export const updateEntrySchema = z.object({
  entryId: z.uuid(),
  description,
  amount: amount("Valor"),
  dueDate: isoDate("Informe o vencimento."),
  paymentMethod: optionalText(200),
});
export type UpdateEntryField = keyof z.input<typeof updateEntrySchema>;

export const payEntrySchema = z.object({
  entryId: z.uuid(),
  paidAt: isoDate("Informe a data do pagamento."),
  paymentMethod: optionalText(200),
});
export type PayEntryField = keyof z.input<typeof payEntrySchema>;
