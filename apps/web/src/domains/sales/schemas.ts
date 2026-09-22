import { z } from "zod";
import { optionalDecimal, optionalUuid } from "@/lib/decimal";
import { SALE_ORIGINS } from "./labels";

const originValues = SALE_ORIGINS.map((item) => item.value) as [string, ...string[]];

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

export const saleSchema = z.object({
  customerId: optionalUuid,
  origin: z
    .string()
    .optional()
    .transform((value) => (value && (originValues as readonly string[]).includes(value) ? value : "BALCAO")),
  items: cartItemsField,
  discountAmount: optionalDecimal({ label: "Desconto", max: 9_999_999_999.99, scale: 2 }),
  paymentMethod: z
    .string()
    .optional()
    .transform((value) => (value && value !== "__none__" ? value : null)),
  paidAmount: optionalDecimal({ label: "Valor pago", max: 9_999_999_999.99, scale: 2 }),
  notes: optionalText(1000, "Observações muito longas."),
  opportunityId: optionalUuid,
});

export type SaleField = keyof z.input<typeof saleSchema>;

export const saleIdSchema = z.uuid();
