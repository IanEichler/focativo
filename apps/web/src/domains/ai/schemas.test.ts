import { describe, expect, it } from "vitest";
import { aiSettingsSchema } from "./schemas";

describe("aiSettingsSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = aiSettingsSchema.safeParse({ enabled: "on", model: "claude-sonnet-5", maxTokensPerReply: "1024" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.monthlyBudgetUsd).toBeUndefined();
    }
  });

  it("treats an unchecked switch (absent field) as disabled", () => {
    const result = aiSettingsSchema.safeParse({ model: "claude-sonnet-5", maxTokensPerReply: "1024" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(false);
  });

  it("rejects an unknown model", () => {
    const result = aiSettingsSchema.safeParse({ enabled: "on", model: "gpt-4", maxTokensPerReply: "1024" });
    expect(result.success).toBe(false);
  });

  it("rejects a max tokens value outside the allowed range", () => {
    const result = aiSettingsSchema.safeParse({ enabled: "on", model: "claude-sonnet-5", maxTokensPerReply: "8192" });
    expect(result.success).toBe(false);
  });

  it("parses a positive monthly budget", () => {
    const result = aiSettingsSchema.safeParse({
      enabled: "on",
      model: "claude-sonnet-5",
      maxTokensPerReply: "1024",
      monthlyBudgetUsd: "25.50",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.monthlyBudgetUsd).toBe(25.5);
  });

  it("rejects a negative monthly budget", () => {
    const result = aiSettingsSchema.safeParse({
      enabled: "on",
      model: "claude-sonnet-5",
      maxTokensPerReply: "1024",
      monthlyBudgetUsd: "-5",
    });
    expect(result.success).toBe(false);
  });

  it("treats a blank system prompt as absent", () => {
    const result = aiSettingsSchema.safeParse({
      enabled: "on",
      model: "claude-sonnet-5",
      maxTokensPerReply: "1024",
      systemPrompt: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.systemPrompt).toBeUndefined();
  });
});
