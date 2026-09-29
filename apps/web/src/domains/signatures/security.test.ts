import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decryptToken, encryptToken, newToken, publicSigningOrigin, sealEvidence, signingReadiness, TOKEN_PATTERN } from "./security";

beforeEach(() => vi.stubEnv("SIGNING_SECRET", "a".repeat(64)));
afterEach(() => vi.unstubAllEnvs());
it("protects stored links and evidence with authenticated cryptography", () => {
  const token = newToken();
  expect(token).toMatch(TOKEN_PATTERN);
  const encrypted = encryptToken(token);
  expect(decryptToken(encrypted)).toBe(token);
  const tampered = Buffer.from(encrypted, "base64"); tampered[20] ^= 1;
  expect(() => decryptToken(tampered.toString("base64"))).toThrow();
  expect(sealEvidence("original")).not.toBe(sealEvidence("changed"));
  expect(sealEvidence({ z: 1, a: { b: 2, a: 3 } })).toBe(sealEvidence({ a: { a: 3, b: 2 }, z: 1 }));
});
it("requires HTTPS but allows signing without email configuration", () => {
  vi.stubEnv("SIGNING_PUBLIC_URL", "http://localhost:3000");
  expect(() => publicSigningOrigin()).toThrow();
  vi.stubEnv("SIGNING_PUBLIC_URL", "https://sign.example.test");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("SIGNING_EMAIL_FROM", "");
  expect(signingReadiness()).toBeNull();
});
