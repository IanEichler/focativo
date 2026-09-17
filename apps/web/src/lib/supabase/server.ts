import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import { REQUEST_ID_HEADER } from "@/lib/request-id";
import type { Database } from "@/types/database.types";

/**
 * Cliente Supabase por requisição, autenticado pelo cookie de sessão do usuário.
 * Todas as queries passam pelo RLS com a identidade do usuário.
 * O x-request-id é propagado ao PostgREST e gravado na auditoria.
 */
export async function createClient() {
  // APIs de request primeiro: marcam a rota como dinâmica antes de validar o env.
  const cookieStore = await cookies();
  const requestId = (await headers()).get(REQUEST_ID_HEADER);
  const env = getPublicEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: requestId ? { [REQUEST_ID_HEADER]: requestId } : {},
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado a partir de Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
