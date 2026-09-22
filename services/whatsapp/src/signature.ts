import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mesma convenção HMAC-SHA256 de apps/web/src/lib/webhook-signature.ts.
 * Duplicado (não importado) de propósito: este serviço é um processo
 * separado, com deploy e ciclo de vida independentes do app Next.js — não
 * deve depender do código-fonte de outro workspace.
 */
export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, signature: string | null | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = signBody(body, secret);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
