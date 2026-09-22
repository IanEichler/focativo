import "server-only";
import { getServerEnv } from "@/lib/env.server";
import type { AIProvider } from "./provider";
import { AnthropicAIProvider } from "./providers/anthropic-provider";
import { DevAIProvider } from "./providers/dev-provider";

let cached: AIProvider | undefined;

/** Sem ANTHROPIC_API_KEY configurada, usa o provider DEV (seção 95: nunca falha por falta de credencial). */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const { ANTHROPIC_API_KEY } = getServerEnv();
  cached = ANTHROPIC_API_KEY ? new AnthropicAIProvider(ANTHROPIC_API_KEY) : new DevAIProvider();
  return cached;
}
