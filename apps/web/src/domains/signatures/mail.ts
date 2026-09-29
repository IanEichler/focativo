import "server-only";

export async function sendSignatureCode(email: string, code: string, requestId: string, deliveryId: string) {
  if (!process.env.RESEND_API_KEY || !process.env.SIGNING_EMAIL_FROM) throw new Error("email_not_configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `signature/${requestId}/${deliveryId}` },
    body: JSON.stringify({
      from: process.env.SIGNING_EMAIL_FROM,
      to: [email],
      subject: "Código para acessar e assinar seu contrato",
      text: `Seu código é ${code}. Ele expira em 10 minutos.\n\nUse-o apenas na página do contrato que você abriu. Não compartilhe este código. Se não solicitou, ignore esta mensagem.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("email_delivery_failed");
}
