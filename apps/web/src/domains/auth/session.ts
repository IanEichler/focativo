import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string;
  avatarUrl: string | null;
}

/**
 * Identidade verificada (JWT validado via getClaims) + perfil.
 * Memoizado por requisição.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const claimEmail = typeof data.claims.email === "string" ? data.claims.email : null;

  return {
    id: userId,
    email: profile?.email ?? claimEmail,
    fullName: profile?.full_name ?? "",
    avatarUrl: profile?.avatar_url ?? null,
  };
});

export async function requireUser(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `${ROUTES.login}?next=${encodeURIComponent(nextPath)}` : ROUTES.login);
  }
  return user;
}

export const isSuperAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return Boolean(data);
});
