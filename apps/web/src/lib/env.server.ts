import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20, "SUPABASE_SECRET_KEY ausente"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ENABLE_DESIGN_SYSTEM_PAGE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PAYMENT_WEBHOOK_SECRET: z.string().min(20, "PAYMENT_WEBHOOK_SECRET ausente"),
  // Sem serviço WhatsApp configurado (Fase 6), a aplicação usa o provider DEV.
  WHATSAPP_SERVICE_URL: z.url().optional(),
  WHATSAPP_SERVICE_SECRET: z.string().min(20).optional(),
  // Sem chave da Anthropic (Fase 7), a aplicação usa o provider DEV (regras
  // simples, sem custo, mas exercitando o mesmo pipeline de tools/handoff).
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/** Segredos: somente servidor. Nunca importar em Client Components. */
export function getServerEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse({
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      LOG_LEVEL: process.env.LOG_LEVEL || undefined,
      ENABLE_DESIGN_SYSTEM_PAGE: process.env.ENABLE_DESIGN_SYSTEM_PAGE || undefined,
      PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET,
      WHATSAPP_SERVICE_URL: process.env.WHATSAPP_SERVICE_URL || undefined,
      WHATSAPP_SERVICE_SECRET: process.env.WHATSAPP_SERVICE_SECRET || undefined,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    });
    if (!parsed.success) {
      throw new Error(
        `Configuração de servidor inválida: ${parsed.error.issues.map((issue) => issue.message).join("; ")}. Veja .env.example.`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

export function getLogLevel(): ServerEnv["LOG_LEVEL"] {
  const level = process.env.LOG_LEVEL;
  return level === "debug" || level === "warn" || level === "error" ? level : "info";
}
