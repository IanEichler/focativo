import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_TEXT, CONSENT_VERSION, publicSigningOrigin, TOKEN_PATTERN } from "@/domains/signatures/security";
import { getSignature, canAccessDocument, signContract, signaturePdf, SigningError } from "@/domains/signatures/service";
import { signatureLocationSchema } from "@/domains/signatures/location";

export const runtime = "nodejs";
const COOKIE = "signature_session";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const bodySchema = z.object({ action: z.literal("sign"), name: z.string().min(2).max(160), accepted: z.literal(true), consentVersion: z.literal(CONSENT_VERSION),
  signature: z.string().max(165000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).optional(), location: signatureLocationSchema.optional() });
const messages: Record<string, string> = {
  unavailable: "Este link está expirado, cancelado ou indisponível. Solicite um novo link à clínica.",
  review_required: "Abra e confira o PDF antes de assinar.",
  consent_required: "Confira seu nome e confirme o aceite do contrato.", invalid_signature: "Não foi possível ler a assinatura desenhada.",
  integrity_error: "A integridade do documento não pôde ser confirmada. Contate a clínica.",
  invalid_location: "Não foi possível validar os dados de localização. Tente assinar novamente.",
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
    const accessible = canAccessDocument(row, session);
    const file = request.nextUrl.searchParams.get("file");
    if (file) {
      if (!["original", "signed"].includes(file)) throw new SigningError("unavailable", 404);
      const bytes = await signaturePdf(row, session, file === "signed");
      return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/pdf",
        "Content-Disposition": `${file === "signed" ? "attachment" : "inline"}; filename="contrato${file === "signed" ? "-assinado" : ""}.pdf"`,
        "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'; sandbox" } });
    }
    return NextResponse.json({ status: row.status, accessible, expiresAt: row.expires_at,
      ...(accessible ? { signerName: row.signer_name, documentName: row.document_name, documentHash: row.original_sha256, consentText: CONSENT_TEXT, consentVersion: CONSENT_VERSION } : {}) }, { headers });
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
    await signContract(token, body, request.headers);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return failure(error); }
}
