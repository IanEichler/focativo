import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const SIGNATURE_BUCKET = "contract-signatures";
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const CONSENT_VERSION = "2026-09-29-v1";
export const CONSENT_TEXT = "Li o contrato apresentado, concordo com seu conteúdo e aceito assiná-lo eletronicamente. Autorizo o registro da confirmação por e-mail, data, horário e informações técnicas deste acesso como evidências da minha manifestação de vontade.";

function key() {
  const value = process.env.SIGNING_SECRET;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Configure SIGNING_SECRET com uma chave de 32 bytes.");
  return Buffer.from(value, "hex");
}
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const codeHash = (token: string, code: string) => createHmac("sha256", key()).update(`otp:${hash(token)}:${code}`).digest("hex");
// JSONB may reorder keys. Canonicalize recursively so archived evidence stays verifiable.
export function serializeEvidence(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializeEvidence).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${serializeEvidence(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const sealEvidence = (value: unknown) => createHmac("sha256", key()).update(`evidence:${serializeEvidence(value)}`).digest("hex");
export function safeEqual(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptToken(value: string) {
  const data = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
export function publicSigningOrigin() {
  const raw = process.env.SIGNING_PUBLIC_URL;
  if (!raw) throw new Error("Configure o domínio público HTTPS em SIGNING_PUBLIC_URL para liberar os links de assinatura.");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|0\.|\[::1\])/.test(url.hostname)) {
    throw new Error("O assinador precisa de um endereço público HTTPS.");
  }
  return url.origin;
}
export function signingReadiness(): string | null {
  try {
    key(); publicSigningOrigin();
    if (!process.env.RESEND_API_KEY || !process.env.SIGNING_EMAIL_FROM) return "Configure o serviço de e-mail e o remetente verificado para enviar os códigos de assinatura.";
    return null;
  } catch (error) { return error instanceof Error ? error.message : "Configure o assinador."; }
}
