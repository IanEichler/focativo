import { describe, expect, it } from "vitest";
import { signWebhookBody, verifyWebhookSignature } from "./webhook-signature";

describe("webhook signature", () => {
  const secret = "test-secret-at-least-20-chars-long";
  const body = JSON.stringify({ provider: "dev", event: "confirmed", paymentId: "abc-123" });

  it("verifies a correctly signed body", () => {
    const signature = signWebhookBody(body, secret);
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = signWebhookBody(body, secret);
    const tampered = JSON.stringify({ provider: "dev", event: "confirmed", paymentId: "someone-elses-id" });
    expect(verifyWebhookSignature(tampered, signature, secret)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const signature = signWebhookBody(body, "a-completely-different-secret-value");
    expect(verifyWebhookSignature(body, signature, secret)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });

  it("rejects a malformed (non-hex) signature without throwing", () => {
    expect(verifyWebhookSignature(body, "not-valid-hex!!", secret)).toBe(false);
  });
});
