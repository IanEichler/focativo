import { createHmac, timingSafeEqual } from "node:crypto";

// Sem "server-only": só funções puras de HMAC (o segredo é passado por
// parâmetro, nunca lido daqui) — usado tanto por pagamentos quanto por
// WhatsApp, e precisa ser importável pelos testes.

/** Assinatura HMAC-SHA256 compartilhada entre quem envia e a rota que recebe o webhook. */
export function signWebhookBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = signWebhookBody(body, secret);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
