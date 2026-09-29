import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_TEXT, CONSENT_VERSION, publicSigningOrigin, TOKEN_PATTERN } from "@/domains/signatures/security";
import { getSignature, isVerified, requestSignatureCode, signContract, signaturePdf, SigningError, verifySignatureCode } from "@/domains/signatures/service";

export const runtime = "nodejs";
const COOKIE = "signature_session";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request_code") }),
  z.object({ action: z.literal("verify"), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("sign"), name: z.string().min(2).max(160), accepted: z.literal(true), consentVersion: z.literal(CONSENT_VERSION),
    signature: z.string().max(165000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).optional() }),
]);
const messages: Record<string, string> = {
  unavailable: "Este link está expirado, cancelado ou indisponível. Solicite um novo link à clínica.",
  verification_required: "Confirme o código recebido e abra o PDF antes de assinar.",
  invalid_code: "Código inválido ou expirado.", locked: "Limite de tentativas atingido. Solicite ajuda à clínica.",
  rate_limit: "Aguarde 60 segundos antes de pedir outro código.", delivery_failed: "Não foi possível enviar o e-mail. Aguarde um minuto e tente novamente.",
  consent_required: "Confira seu nome e confirme o aceite do contrato.", invalid_signature: "Não foi possível ler a assinatura desenhada.",
  integrity_error: "A integridade do documento não pôde ser confirmada. Contate a clínica.",
  too_large: "Solicitação muito grande.",
};
function failure(error: unknown) {
  const known = error instanceof SigningError;
  return NextResponse.json({ error: known ? messages[error.code] ?? "Não foi possível concluir. Tente novamente." : "Não foi possível concluir. Tente novamente." }, { status: known ? error.status : 500, headers });
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const row = await getSignature(token);
    const session = request.cookies.get(COOKIE)?.value;
    const verified = isVerified(row, session);
    const file = request.nextUrl.searchParams.get("file");
    if (file) {
      if (!["original", "signed"].includes(file)) throw new SigningError("unavailable", 404);
      const bytes = await signaturePdf(row, session, file === "signed");
      return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/pdf",
        "Content-Disposition": `${file === "signed" ? "attachment" : "inline"}; filename="contrato${file === "signed" ? "-assinado" : ""}.pdf"`,
        "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'; sandbox" } });
    }
    const [local, domain] = row.signer_email.split("@");
    return NextResponse.json({ status: row.status, verified, emailHint: `${local?.slice(0, 2)}***@${domain}`, expiresAt: row.expires_at,
      ...(verified ? { signerName: row.signer_name, documentName: row.document_name, documentHash: row.original_sha256, consentText: CONSENT_TEXT, consentVersion: CONSENT_VERSION } : {}) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (request.headers.get("origin") !== publicSigningOrigin()) return NextResponse.json({ error: "Origem não permitida." }, { status: 403, headers });
    const { token } = await params;
    if (!TOKEN_PATTERN.test(token)) throw new SigningError("unavailable", 404);
    if (Number(request.headers.get("content-length") ?? 0) > 180000) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413, headers });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          if (length > 180000) { await reader.cancel(); throw new SigningError("too_large", 413); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
    }
    const text = Buffer.concat(chunks).toString("utf8");
    let parsed;
    try { parsed = bodySchema.safeParse(JSON.parse(text)); } catch { throw new SigningError("invalid_signature"); }
    if (!parsed.success) throw new SigningError("consent_required");
    const body = parsed.data;
    if (body.action === "request_code") await requestSignatureCode(token);
    if (body.action === "sign") await signContract(token, request.cookies.get(COOKIE)?.value, body, request.headers);
    const response = NextResponse.json({ ok: true }, { headers });
    if (body.action === "verify") {
      const session = await verifySignatureCode(token, body.code);
      response.cookies.set(COOKIE, session, { httpOnly: true, secure: true, sameSite: "strict", path: `/api/assinaturas/${token}`, maxAge: 1800 });
    }
    return response;
  } catch (error) { return failure(error); }
}
