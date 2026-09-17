import { z } from "zod";
import { optionalUuid, optionalDecimal, requiredDecimal } from "@/lib/decimal";

const idempotencyKey = z.string().min(8, "Operação inválida. Recarregue a página.").max(128);
const quantity = requiredDecimal({ label: "Quantidade", min: 0, exclusiveMin: true, max: 99_999_999_999.999, scale: 3 });
const reason = z.string().trim().min(3, "Descreva o motivo (mín. 3 caracteres).").max(500, "Motivo muito longo.");
const optionalReason = z
  .string()
  .trim()
  .max(500, "Observação muito longa.")
  .optional()
  .transform((value) => (value ? value : null));

const optionalDate = z
  .string()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Data inválida.");

const lotCode = z
  .string()
  .trim()
  .max(64, "Código do lote muito longo.")
  .optional()
  .transform((value) => (value ? value : null));

export const entrySchema = z
  .object({
    variantId: z.uuid({ message: "Selecione o produto." }),
    idempotencyKey,
    quantity,
    unitCost: optionalDecimal({ label: "Custo unitário", max: 9_999_999_999.99, scale: 2 }),
    reason: optionalReason,
    lotId: optionalUuid,
    lotCode,
    manufacturedOn: optionalDate,
    expiresOn: optionalDate,
    supplierId: optionalUuid,
  })
  .refine((data) => !data.manufacturedOn || !data.expiresOn || data.expiresOn >= data.manufacturedOn, {
    message: "A validade deve ser posterior à fabricação.",
    path: ["expiresOn"],
  });

export const lossSchema = z.object({
  variantId: z.uuid({ message: "Selecione o produto." }),
  idempotencyKey,
  quantity,
  reason,
  lotId: optionalUuid,
});

export const adjustSchema = z.object({
  variantId: z.uuid({ message: "Selecione o produto." }),
  idempotencyKey,
  countedQuantity: requiredDecimal({ label: "Quantidade contada", min: 0, max: 99_999_999_999.999, scale: 3 }),
  reason,
  lotId: optionalUuid,
  lotCode,
  expiresOn: optionalDate,
});

export type StockOperation = "entry" | "loss" | "adjust";
export type EntryField = keyof z.input<typeof entrySchema>;
export type LossField = keyof z.input<typeof lossSchema>;
export type AdjustField = keyof z.input<typeof adjustSchema>;
