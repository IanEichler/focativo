import "server-only";

/**
 * Preço por milhão de tokens (USD), mantido manualmente — mesmo espírito do
 * financeiro da Fase 5 ("V1 operacional", não uma integração de billing do
 * fornecedor). Atualize aqui se os preços da Anthropic mudarem.
 */
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
};

const DEFAULT_PRICING = PRICING_PER_MILLION_TOKENS["claude-sonnet-5"]!;

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_MILLION_TOKENS[model] ?? DEFAULT_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
