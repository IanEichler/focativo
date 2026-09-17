import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";
import { isGuestOnlyPath, isProtectedPath, ROUTES } from "@/lib/routes";

/**
 * Proxy (antigo middleware):
 *  1. atribui/propaga x-request-id (correlação de logs e auditoria);
 *  2. renova a sessão Supabase e grava cookies atualizados;
 *  3. redireciona de forma OTIMISTA rotas protegidas/visitante.
 *
 * Não é o mecanismo de autorização: páginas, Server Actions e o RLS do banco
 * revalidam a identidade e as permissões em cada operação.
 */
export async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  const forwardHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    return headers;
  };

  let response = NextResponse.next({ request: { headers: forwardHeaders() } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: forwardHeaders() } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  // Não inserir lógica entre a criação do cliente e getClaims().
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated && isProtectedPath(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = ROUTES.login;
    target.search = "";
    target.searchParams.set("next", `${pathname}${search}`);
    return redirectPreservingCookies(target, response, requestId);
  }

  if (isAuthenticated && isGuestOnlyPath(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = ROUTES.appHome;
    target.search = "";
    return redirectPreservingCookies(target, response, requestId);
  }

  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

function redirectPreservingCookies(target: URL, source: NextResponse, requestId: string) {
  const redirect = NextResponse.redirect(target);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  source.headers.forEach((value, header) => {
    if (/^(cache-control|expires|pragma)$/i.test(header)) redirect.headers.set(header, value);
  });
  redirect.headers.set(REQUEST_ID_HEADER, requestId);
  return redirect;
}

export const config = {
  matcher: [
    // Tudo, exceto assets estáticos e webhooks (que têm verificação própria).
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
