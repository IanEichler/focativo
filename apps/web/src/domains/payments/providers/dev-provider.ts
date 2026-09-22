import "server-only";
import type { ChargeInput, ChargeResult, PaymentProvider } from "../provider";

/**
 * Provider DEV: sem credencial de gateway real (seção 95 — "sem credenciais,
 * haverá providers DEV claramente identificados na UI; mocks nunca serão
 * apresentados como integração real"). Não fabrica confirmação sozinho: a
 * cobrança fica PENDING até alguém disparar `/api/webhooks/payments` de
 * verdade (manualmente, via `simulatePaymentWebhookAction`) — o pipeline de
 * webhook (assinatura HMAC, rota HTTP, RPC idempotente) roda de ponta a
 * ponta, só a origem da chamada é simulada em vez de um gateway real.
 */
export class DevPaymentProvider implements PaymentProvider {
  readonly code = "dev";
  readonly isDev = true;

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    return {
      providerChargeId: `dev_${input.paymentId}`,
      status: "pending",
      instructions: {
        pixCode: `00020126DEV-AMBIENTE-DE-DESENVOLVIMENTO-${input.paymentId}-52040000530398654${Math.round(input.amount * 100)}5802BR`,
      },
    };
  }

  async getCharge(): Promise<{ status: "pending" }> {
    return { status: "pending" };
  }

  async cancelCharge(): Promise<void> {
    // Sem gateway real para notificar; o cancelamento é só o RPC payment_cancel.
  }
}

export function getPaymentProvider(code: string = "dev"): PaymentProvider {
  switch (code) {
    case "dev":
    default:
      return new DevPaymentProvider();
  }
}
