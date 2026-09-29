import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { codeHash, decryptToken, encryptToken, newCode, newToken, publicSigningOrigin, sealEvidence, signingReadiness, TOKEN_PATTERN } from "./security";

beforeEach(() => vi.stubEnv("SIGNING_SECRET", "a".repeat(64)));
afterEach(() => vi.unstubAllEnvs());
it("protects stored links with authenticated encryption and binds OTPs to the link", () => {
  const token = newToken();
  expect(token).toMatch(TOKEN_PATTERN);
  expect(newCode()).toMatch(/^\d{6}$/);
  const encrypted = encryptToken(token);
  expect(decryptToken(encrypted)).toBe(token);
  const tampered = Buffer.from(encrypted, "base64"); tampered[20] ^= 1;
  expect(() => decryptToken(tampered.toString("base64"))).toThrow();
  expect(codeHash(token, "123456")).not.toBe(codeHash(newToken(), "123456"));
  expect(sealEvidence("original")).not.toBe(sealEvidence("changed"));
  expect(sealEvidence({ z: 1, a: { b: 2, a: 3 } })).toBe(sealEvidence({ a: { a: 3, b: 2 }, z: 1 }));
});
it("blocks public links until HTTPS and email delivery are configured", () => {
  vi.stubEnv("SIGNING_PUBLIC_URL", "http://localhost:3000");
  expect(() => publicSigningOrigin()).toThrow();
  vi.stubEnv("SIGNING_PUBLIC_URL", "https://sign.example.test");
  vi.stubEnv("RESEND_API_KEY", "");
  expect(signingReadiness()).toContain("e-mail");
  vi.stubEnv("RESEND_API_KEY", "test-only");
  vi.stubEnv("SIGNING_EMAIL_FROM", "test@example.test");
  expect(signingReadiness()).toBeNull();
});
