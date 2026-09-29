import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database.types";

/** Dedicated backend client. Call only after staff RLS authorization or token/session verification.
 * Signing tables and private artifacts intentionally have no direct browser grants. */
export function signingClient() {
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export type SignatureRow = Database["public"]["Tables"]["contract_signatures"]["Row"];
