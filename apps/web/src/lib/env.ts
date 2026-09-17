import { z } from "zod";

/**
 * Variáveis públicas (inlined no bundle do cliente pelo Next.js).
 * Os acessos precisam ser literais (`process.env.NEXT_PUBLIC_X`) para o inline funcionar.
 * Validação é lazy para permitir `next build` em CI sem segredos.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL inválida" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausente"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Estoque IA"),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublicEnv: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  if (!cachedPublicEnv) {
    const parsed = publicSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
      NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || undefined,
    });
    if (!parsed.success) {
      throw new Error(
        `Configuração pública inválida: ${parsed.error.issues.map((issue) => issue.message).join("; ")}. Veja .env.example.`,
      );
    }
    cachedPublicEnv = parsed.data;
  }
  return cachedPublicEnv;
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Estoque IA";
