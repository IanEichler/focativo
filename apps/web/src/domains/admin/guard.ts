import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin, type CurrentUser } from "@/domains/auth/session";
import { ROUTES } from "@/lib/routes";

/**
 * Exige SUPER_ADMIN. Para quem não é, a área administrativa simplesmente
 * "não existe" (404) — não revelamos sua presença.
 * As RPCs admin_* revalidam o papel no banco.
 */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.admin)}`);
  if (!(await isSuperAdmin())) notFound();
  return user;
}
