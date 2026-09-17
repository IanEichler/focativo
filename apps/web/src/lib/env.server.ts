import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20, "SUPABASE_SECRET_KEY ausente"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ENABLE_DESIGN_SYSTEM_PAGE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
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
