import { describe, expect, it } from "vitest";
import { sendMessageSchema, simulateIncomingMessageSchema } from "./schemas";

describe("sendMessageSchema", () => {
  it("accepts a valid message", () => {
    const result = sendMessageSchema.safeParse({
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      content: "Olá!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty message", () => {
    const result = sendMessageSchema.safeParse({
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      content: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed conversationId", () => {
    const result = sendMessageSchema.safeParse({ conversationId: "not-a-uuid", content: "Olá!" });
    expect(result.success).toBe(false);
  });

  it("rejects a message longer than 4000 characters", () => {
    const result = sendMessageSchema.safeParse({
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      content: "a".repeat(4001),
    });
    expect(result.success).toBe(false);
  });
});

describe("simulateIncomingMessageSchema", () => {
  it("strips non-digit characters from the phone number", () => {
    const result = simulateIncomingMessageSchema.safeParse({ whatsappNumber: "(11) 99999-8888", content: "Oi" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.whatsappNumber).toBe("11999998888");
  });

  it("rejects a phone number that is too short", () => {
    const result = simulateIncomingMessageSchema.safeParse({ whatsappNumber: "123", content: "Oi" });
    expect(result.success).toBe(false);
  });

  it("treats a blank senderName as absent", () => {
    const result = simulateIncomingMessageSchema.safeParse({
      whatsappNumber: "11999998888",
      content: "Oi",
      senderName: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.senderName).toBeUndefined();
  });

  it("rejects an empty message", () => {
    const result = simulateIncomingMessageSchema.safeParse({ whatsappNumber: "11999998888", content: "" });
    expect(result.success).toBe(false);
  });
});
