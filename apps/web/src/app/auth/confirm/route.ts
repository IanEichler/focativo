import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { ROUTES, safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Confirmação de links enviados por e-mail (cadastro, convite, recuperação).
 * Suporta o fluxo por token_hash (recomendado para SSR — ver README/templates)
 * e o fluxo PKCE por `code`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(
    searchParams.get("next"),
    type === "recovery" || type === "invite" ? ROUTES.resetPassword : ROUTES.appHome,
  );

  const supabase = await createClient();
  let failed = true;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = Boolean(error);
    if (error) logger.warn({ event: "auth.confirm", status: "denied", flow: "token_hash", type, reason: error.code });
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
    if (error) logger.warn({ event: "auth.confirm", status: "denied", flow: "pkce", reason: error.code });
  }

  const target = request.nextUrl.clone();
  target.search = "";
  if (failed) {
    target.pathname = ROUTES.login;
    target.searchParams.set("erro", "link_invalido");
  } else {
    const nextUrl = new URL(next, request.nextUrl.origin);
    target.pathname = nextUrl.pathname;
    target.search = nextUrl.search;
  }
  return NextResponse.redirect(target);
}
