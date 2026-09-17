import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database.types";

/**
 * Cliente com a secret key (ignora RLS).
 *
 * USO RESTRITO: somente operações administrativas do Auth (ex.: convidar conta)
 * DEPOIS de a autorização do usuário ter sido verificada pelo banco.
 * Nunca usar para ler/escrever dados comerciais em nome de um usuário.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const { SUPABASE_SECRET_KEY } = getServerEnv();

  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
