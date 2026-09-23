import { describe, expect, it } from "vitest";
import { aiSettingsSchema } from "./schemas";

describe("aiSettingsSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = aiSettingsSchema.safeParse({ enabled: "on" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(true);
  });

  it("treats an unchecked switch (absent field) as disabled", () => {
    const result = aiSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(false);
  });

  it("treats a blank system prompt as absent", () => {
    const result = aiSettingsSchema.safeParse({ enabled: "on", systemPrompt: "   " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.systemPrompt).toBeUndefined();
  });

  it("rejects a system prompt over the character limit", () => {
    const result = aiSettingsSchema.safeParse({ enabled: "on", systemPrompt: "x".repeat(4001) });
    expect(result.success).toBe(false);
  });
});
