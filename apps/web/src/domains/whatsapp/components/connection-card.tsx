"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { QrCode, Smartphone, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import { formatDateTime } from "@/lib/format";
import { connectWhatsAppAction, disconnectWhatsAppAction, simulateWhatsAppScanAction } from "../actions";
import { WHATSAPP_STATUS_LABELS, WHATSAPP_STATUS_TONES } from "../labels";
import type { WhatsAppAccount } from "../queries";

export function ConnectionCard({ account, isDev }: { account: WhatsAppAccount; isDev: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ status: "success" | "error"; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") setError(result.message ?? "Não foi possível concluir a ação.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-body font-semibold">Status da conexão</p>
          <StatusBadge tone={WHATSAPP_STATUS_TONES[account.status]}>
            {WHATSAPP_STATUS_LABELS[account.status]}
          </StatusBadge>
        </div>
        {account.status === "CONNECTED" ? (
          <Button variant="outline" disabled={pending} onClick={() => run(disconnectWhatsAppAction)}>
            <Unplug className="size-4" /> Desconectar
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => run(connectWhatsAppAction)}>
            <QrCode className="size-4" /> Conectar
          </Button>
        )}
      </div>

      {account.status === "WAITING_QR" && account.qrCode && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-6">
          {account.qrCode.startsWith("data:image") ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URI gerada no servidor, não passa pelo otimizador de imagens.
            <img src={account.qrCode} alt="QR Code do WhatsApp" className="size-48" />
          ) : (
            <>
              <QrCode className="size-24 text-muted-foreground" />
              <code className="rounded bg-secondary px-2 py-1 text-caption">{account.qrCode}</code>
            </>
          )}
          <p className="text-caption text-subtle">Escaneie com o WhatsApp do número que atenderá este tenant.</p>
          {isDev && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(simulateWhatsAppScanAction)}>
              <Smartphone className="size-4" /> Simular leitura do QR (dev)
            </Button>
          )}
        </div>
      )}

      {account.status === "CONNECTED" && (
        <dl className="grid grid-cols-2 gap-3 text-small">
          <div>
            <dt className="text-caption text-subtle">Número conectado</dt>
            <dd className="font-medium">{account.phoneNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-subtle">Conectado em</dt>
            <dd className="font-medium">{account.connectedAt ? formatDateTime(account.connectedAt) : "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-subtle">Última atividade</dt>
            <dd className="font-medium">{account.lastActivityAt ? formatDateTime(account.lastActivityAt) : "—"}</dd>
          </div>
        </dl>
      )}

      {account.status === "ERROR" && account.errorMessage && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger">{account.errorMessage}</p>
      )}

      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger">{error}</p>}

      {isDev && (
        <p className="text-caption text-subtle">
          Provider de desenvolvimento ativo: nenhuma conexão real com o WhatsApp é feita. Configure{" "}
          <code>WHATSAPP_SERVICE_URL</code> e <code>WHATSAPP_SERVICE_SECRET</code> para usar o serviço real.
        </p>
      )}
    </div>
  );
}
