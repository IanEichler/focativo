import { config } from "./config";
import { signBody } from "./signature";

/**
 * Envia um evento de sessão/mensagem para o app principal
 * (/api/webhooks/whatsapp), assinado com o mesmo segredo que o app usa para
 * validar — o app já sabe processar esses eventos desde a Fase 6 (rota
 * criada e testada com o provider DEV antes deste serviço real existir).
 */
export async function postToApp(payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  const response = await fetch(`${config.mainAppUrl}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-signature": signBody(body, config.serviceSecret) },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[webhook] app respondeu ${response.status} para evento ${payload.event}: ${text}`);
  }
}
