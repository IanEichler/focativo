import { z } from "zod";

export const signatureLocationSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("captured"),
    source: z.literal("browser_geolocation"),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracyMeters: z.number().finite().nonnegative(),
    capturedAt: z.iso.datetime(),
  }).strict(),
  z.object({ status: z.enum(["denied", "timeout", "unavailable", "unsupported", "not_requested"]) }).strict(),
]);

export type SignatureLocation = z.infer<typeof signatureLocationSchema>;

export const locationStatusLabels = {
  denied: "Permissão não concedida pela signatária",
  timeout: "Tempo de coleta esgotado",
  unavailable: "Localização indisponível no dispositivo",
  unsupported: "Navegador sem suporte à localização",
  not_requested: "Localização não solicitada nesta versão do assinador",
} as const;
