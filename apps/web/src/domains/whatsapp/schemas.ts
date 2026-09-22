import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.uuid(),
  content: z.string().trim().min(1, "Escreva uma mensagem.").max(4000, "Mensagem muito longa."),
});

export type SendMessageField = keyof z.input<typeof sendMessageSchema>;

export const simulateIncomingMessageSchema = z.object({
  whatsappNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => /^[0-9]{10,15}$/.test(value), "Telefone inválido: use DDD + número."),
  content: z.string().trim().min(1, "Escreva uma mensagem.").max(4000, "Mensagem muito longa."),
  senderName: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type SimulateIncomingMessageField = keyof z.input<typeof simulateIncomingMessageSchema>;
