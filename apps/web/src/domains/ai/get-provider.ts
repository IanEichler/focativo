import "server-only";
import { getServerEnv } from "@/lib/env.server";
import type { AIProvider } from "./provider";
import { AnthropicAIProvider } from "./providers/anthropic-provider";
import { DevAIProvider } from "./providers/dev-provider";
import { GeminiAIProvider } from "./providers/gemini-provider";
import { OpenAIAIProvider } from "./providers/openai-provider";

const cache = new Map<string, AIProvider>();

/**
 * Escolhido por tenant (tenant_ai_platform_limits.provider, admin master —
 * ver Fase 2 da separação modelo/limites). Sem a chave correspondente
 * configurada no servidor, retorna DEV para a simulação local. O agente
 * bloqueia esse simulador no transporte real e encaminha para a equipe.
 */
export function getAIProvider(providerCode: string = "anthropic"): AIProvider {
  const cached = cache.get(providerCode);
  if (cached) return cached;

  const { ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY } = getServerEnv();
  let provider: AIProvider;
  if (providerCode === "gemini") {
    provider = GEMINI_API_KEY ? new GeminiAIProvider(GEMINI_API_KEY) : new DevAIProvider();
  } else if (providerCode === "openai") {
    provider = OPENAI_API_KEY ? new OpenAIAIProvider(OPENAI_API_KEY) : new DevAIProvider();
  } else {
    provider = ANTHROPIC_API_KEY ? new AnthropicAIProvider(ANTHROPIC_API_KEY) : new DevAIProvider();
  }
  cache.set(providerCode, provider);
  return provider;
}
