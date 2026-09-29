import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ row: vi.fn(), verified: vi.fn(), send: vi.fn(), verify: vi.fn(), sign: vi.fn(), pdf: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./service", () => ({ getSignature: mock.row, canAccessDocument: mock.verified, signContract: mock.sign, signaturePdf: mock.pdf,
  SigningError: class extends Error { constructor(public code: string, public status = 400) { super(code); } },
}));
vi.mock("./security", async importOriginal => ({ ...await importOriginal<object>(), publicSigningOrigin: () => "https://sign.example.test" }));
import { GET, POST } from "@/app/api/assinaturas/[token]/route";
const token = "a".repeat(43);
const params = { params: Promise.resolve({ token }) };
const url = `https://sign.example.test/api/assinaturas/${token}`;
beforeEach(() => {
  vi.clearAllMocks(); mock.verified.mockReturnValue(true);
  mock.row.mockResolvedValue({ status: "PENDING", signer_email: "teste@example.test", signer_name: "Private name", original_sha256: "private hash", expires_at: "future" });
  mock.verify.mockResolvedValue("b".repeat(43));
});
it("opens the contract directly through an authorized link without an email step", async () => {
  const response = await GET(new NextRequest(url), params);
  expect(await response.json()).toMatchObject({ status: "PENDING", accessible: true, signerName: "Private name", documentHash: "private hash", expiresAt: "future" });
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
it("accepts the explicit signature without a verification cookie", async () => {
  const body = JSON.stringify({ action: "sign", name: "Private name", accepted: true, consentVersion: "2026-09-29-v2-link" });
  const response = await POST(new NextRequest(url, { method: "POST", headers: { origin: "https://sign.example.test" }, body }), params);
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
  expect(mock.sign).toHaveBeenCalledWith(token, JSON.parse(body), expect.any(Headers));
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("no longer exposes email code actions", async () => {
  for (const action of ["verify", "request_code"]) {
    const response = await POST(new NextRequest(url, { method: "POST", headers: { origin: "https://sign.example.test" }, body: JSON.stringify({ action, code: "123456" }) }), params);
    expect(response.status).toBe(400);
  }
  expect(mock.sign).not.toHaveBeenCalled();
});
