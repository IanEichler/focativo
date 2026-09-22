import { z } from "zod";

const cartItemSchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().positive(),
});

const cartItemsField = z.string().transform((value, ctx) => {
  try {
    const parsed = JSON.parse(value);
    const result = z.array(cartItemSchema).min(1).safeParse(parsed);
    if (!result.success) throw new Error();
    return result.data;
  } catch {
    ctx.addIssue({ code: "custom", message: "Adicione ao menos um produto." });
    return z.NEVER;
  }
});

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null));

export const reservationSchema = z.object({
  customerId: z.uuid("Selecione um cliente."),
  items: cartItemsField,
  expiresAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  origin: z
    .string()
    .optional()
    .transform((value) => (value && value !== "__none__" ? value : null)),
  notes: optionalText(1000, "Observações muito longas."),
});

export type ReservationField = keyof z.input<typeof reservationSchema>;

export const reservationIdSchema = z.uuid();
