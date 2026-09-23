import { z } from "zod";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null));

export const serviceSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Mínimo de 2 caracteres.").max(160, "Máximo de 160 caracteres."),
  description: optionalText(2000, "Descrição muito longa."),
  durationMinutes: z.coerce.number().int().min(5, "Mínimo de 5 minutos.").max(480, "Máximo de 8 horas."),
  price: z.coerce.number().min(0, "Não pode ser negativo."),
  // Sem .default(true): o switch só existe no form de edição, então o campo
  // ausente aqui vira false corretamente (o create nem lê isActive — a RPC
  // de criação sempre nasce ativa; só o update lê este campo).
  isActive: z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean()),
  // JSON-encoded array de user ids (mesmo padrão do carrinho de reservas) —
  // vazio significa "qualquer profissional ativo pode atender este serviço".
  professionalUserIds: z
    .string()
    .transform((value, ctx) => {
      try {
        const parsed = JSON.parse(value || "[]");
        const result = z.array(z.uuid()).safeParse(parsed);
        if (!result.success) throw new Error();
        return result.data;
      } catch {
        ctx.addIssue({ code: "custom", message: "Seleção de profissionais inválida." });
        return z.NEVER;
      }
    })
    .default([]),
  requiresHumanConfirmation: z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean()),
  restrictions: optionalText(1000, "Restrições muito longas."),
});

export type ServiceField = keyof z.input<typeof serviceSchema>;

export const appointmentSchema = z.object({
  customerId: z.uuid("Selecione um cliente."),
  serviceId: z.uuid("Selecione um serviço."),
  professionalUserId: z.uuid("Selecione um profissional."),
  startsAt: z.string().trim().min(1, "Informe a data e o horário."),
  notes: optionalText(1000, "Observações muito longas."),
});

export type AppointmentField = keyof z.input<typeof appointmentSchema>;

export const appointmentIdSchema = z.uuid();

const timeOrNull = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.")
  .nullable();

export const businessHoursSchema = z
  .array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      opensAt: timeOrNull,
      closesAt: timeOrNull,
      isClosed: z.boolean(),
    }),
  )
  .max(7);

export const professionalExceptionSchema = z.object({
  professionalUserId: z.uuid(),
  date: z.iso.date("Data inválida."),
  reason: optionalText(280, "Motivo muito longo."),
});

export type ProfessionalExceptionField = keyof z.input<typeof professionalExceptionSchema>;
