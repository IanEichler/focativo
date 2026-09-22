import { z } from "zod";

export const createChargeSchema = z.object({
  reservationId: z.uuid(),
  method: z.enum(["pix", "credit_card", "debit_card", "other"], { message: "Forma de pagamento inválida." }),
});

export type CreateChargeField = keyof z.input<typeof createChargeSchema>;
