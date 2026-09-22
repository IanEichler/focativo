import "server-only";

/**
 * Abstração de gateway de pagamento (seção 45 do escopo). Nenhum domínio
 * comercial deve depender diretamente de um gateway específico — só desta
 * interface, no mesmo espírito do WhatsAppProvider (Fase 6).
 */
export interface ChargeInput {
  /** id de public.payments — usado como referência estável com o provider. */
  paymentId: string;
  amount: number;
  method: string;
  customerName: string;
}

export type ChargeProviderStatus = "pending" | "confirmed" | "failed";

export interface ChargeResult {
  providerChargeId: string;
  status: ChargeProviderStatus;
  /** Instruções de pagamento para o cliente (ex.: copia-e-cola do PIX). Só exibição. */
  instructions?: { pixCode?: string; paymentUrl?: string };
}

export interface PaymentProvider {
  readonly code: string;
  readonly isDev: boolean;
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  getCharge(providerChargeId: string): Promise<{ status: ChargeProviderStatus }>;
  cancelCharge(providerChargeId: string): Promise<void>;
}
