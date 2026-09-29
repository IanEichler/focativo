import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ row: vi.fn(), verified: vi.fn(), send: vi.fn(), verify: vi.fn(), sign: vi.fn(), pdf: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./service", () => ({ getSignature: mock.row, isVerified: mock.verified, requestSignatureCode: mock.send,
  verifySignatureCode: mock.verify, signContract: mock.sign, signaturePdf: mock.pdf,
  SigningError: class extends Error { constructor(public code: string, public status = 400) { super(code); } },
}));
vi.mock("./security", async importOriginal => ({ ...await importOriginal<object>(), publicSigningOrigin: () => "https://sign.example.test" }));
import { GET, POST } from "@/app/api/assinaturas/[token]/route";
const token = "a".repeat(43);
const params = { params: Promise.resolve({ token }) };
const url = `https://sign.example.test/api/assinaturas/${token}`;
beforeEach(() => {
  vi.clearAllMocks(); mock.verified.mockReturnValue(false);
  mock.row.mockResolvedValue({ status: "PENDING", signer_email: "teste@example.test", signer_name: "Private name", original_sha256: "private hash", expires_at: "future" });
  mock.verify.mockResolvedValue("b".repeat(43));
});
it("does not expose the document or full identity before code verification", async () => {
  const response = await GET(new NextRequest(url), params);
  expect(await response.json()).toEqual({ status: "PENDING", verified: false, emailHint: "te***@example.test", expiresAt: "future" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("rejects cross-origin mutations before sending an email", async () => {
  const response = await POST(new NextRequest(url, { method: "POST", headers: { origin: "https://evil.test" }, body: '{"action":"request_code"}' }), params);
  expect(response.status).toBe(403); expect(mock.send).not.toHaveBeenCalled();
});
it("rejects oversized bodies even without Content-Length", async () => {
  const response = await POST(new NextRequest(url, { method: "POST", headers: { origin: "https://sign.example.test" }, body: " ".repeat(180001) }), params);
  expect(response.status).toBe(413); expect(mock.send).not.toHaveBeenCalled();
});
it("stores verification in a scoped HttpOnly Secure cookie, never the response body", async () => {
  const response = await POST(new NextRequest(url, { method: "POST", headers: { origin: "https://sign.example.test" }, body: '{"action":"verify","code":"123456"}' }), params);
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain(`Path=/api/assinaturas/${token}`);
});
