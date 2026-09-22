import "server-only";
import { getServerEnv } from "@/lib/env.server";
import type { WhatsAppProvider } from "./provider";
import { DevWhatsAppProvider } from "./providers/dev-provider";
import { ServiceWhatsAppProvider } from "./providers/service-provider";

let cached: WhatsAppProvider | undefined;

/**
 * Sem WHATSAPP_SERVICE_URL configurada, usa o provider DEV — nunca falha o
 * build/deploy por falta de infraestrutura de WhatsApp (seção 95).
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;
  const { WHATSAPP_SERVICE_URL, WHATSAPP_SERVICE_SECRET } = getServerEnv();
  cached =
    WHATSAPP_SERVICE_URL && WHATSAPP_SERVICE_SECRET
      ? new ServiceWhatsAppProvider(WHATSAPP_SERVICE_URL, WHATSAPP_SERVICE_SECRET)
      : new DevWhatsAppProvider();
  return cached;
}
