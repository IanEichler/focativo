"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, CircleCheck, LoaderCircle, QrCode, Smartphone, Unplug, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  connectWhatsAppAction,
  disconnectWhatsAppAction,
  getWhatsAppConnectionAction,
  simulateWhatsAppScanAction,
} from "../actions";
import { WHATSAPP_STATUS_LABELS, WHATSAPP_STATUS_TONES } from "../labels";
import type { ConnectionInfo } from "../provider";
import type { WhatsAppAccount } from "../queries";

export function ConnectionCard({ account, isDev }: { account: WhatsAppAccount; isDev: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<"connect" | "disconnect" | "simulate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [live, setLive] = useState<ConnectionInfo | null>(null);
  const previousStatus = useRef(account.status);
  const connection = live ?? account;
  const connected = connection.status === "CONNECTED";
  const waiting = connection.status === "WAITING_QR";
  const preparing = (pending && operation === "connect") || (waiting && !connection.qrCode);
  const activeStep = connected ? 3 : waiting && connection.qrCode ? 1 : 0;

  useEffect(() => {
    if (pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = 2500;
      try {
        if (document.visibilityState === "visible") {
          const result = await getWhatsAppConnectionAction();
          if (cancelled) return;
          if (result.status === "success") {
            setLive(result.connection);
            setCheckError(null);
            const status = result.connection.status;
            if (status !== previousStatus.current) {
              previousStatus.current = status;
              router.refresh();
            }
            if (status === "CONNECTED" || status === "DISCONNECTED") delay = 10000;
          } else {
            setCheckError(result.message);
          }
        }
      } catch {
        if (!cancelled) setCheckError("Não foi possível verificar a conexão. Tentando novamente…");
      } finally {
        if (!cancelled) timer = setTimeout(poll, delay);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, router]);

  function run(
    kind: "connect" | "disconnect" | "simulate",
    fn: () => Promise<{ status: "success" | "error"; message?: string }>,
  ) {
    setError(null);
    setOperation(kind);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result.status === "error") {
          setError(result.message ?? "Não foi possível concluir a ação.");
        } else {
          if (kind === "connect") setLive({ status: "WAITING_QR" });
          if (kind === "disconnect") setLive({ status: "DISCONNECTED" });
          router.refresh();
        }
      } catch {
        setError("Não foi possível concluir a ação. Tente novamente.");
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-body font-semibold">Conexão com o WhatsApp</p>
          <div role="status" aria-live="polite">
            <StatusBadge tone={WHATSAPP_STATUS_TONES[connection.status]}>
              {preparing ? "Preparando conexão…" : WHATSAPP_STATUS_LABELS[connection.status]}
            </StatusBadge>
          </div>
        </div>
        {connected || waiting ? (
          <Button variant="outline" disabled={pending} onClick={() => run("disconnect", disconnectWhatsAppAction)}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Unplug className="size-4" />
            )}
            {connected ? "Desconectar" : "Cancelar conexão"}
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => run("connect", connectWhatsAppAction)}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <QrCode className="size-4" />
            )}
            {pending ? "Preparando…" : connection.status === "ERROR" ? "Tentar novamente" : "Conectar WhatsApp"}
          </Button>
        )}
      </div>

      <ol aria-label="Etapas da conexão" className="grid grid-cols-3 gap-2">
        {["Gerar QR Code", "Ler no celular", "Conectado"].map((label, index) => (
          <li
            key={label}
            aria-current={activeStep === index ? "step" : undefined}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full border text-small font-semibold transition-colors duration-300 motion-reduce:transition-none",
                activeStep > index
                  ? "border-success bg-success-soft text-success"
                  : activeStep === index
                    ? "border-brand-600 bg-brand-100 text-brand-800"
                    : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {activeStep > index ? <Check className="size-4" /> : index + 1}
            </span>
            <span className="text-caption sm:text-small">{label}</span>
          </li>
        ))}
      </ol>

      {preparing ? (
        <div
          role="status"
          className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg bg-secondary/50 p-6 text-center"
        >
          <div className="relative flex size-20 items-center justify-center">
            <span className="absolute inset-0 animate-pulse rounded-full bg-brand-100 motion-reduce:animate-none" />
            <LoaderCircle className="relative size-9 animate-spin text-brand-600 motion-reduce:animate-none" />
          </div>
          <div>
            <p className="font-medium">Preparando seu QR Code</p>
            <p className="mt-1 text-small text-muted-foreground">
              Aguarde alguns instantes. Ele vai aparecer aqui automaticamente.
            </p>
          </div>
        </div>
      ) : waiting && connection.qrCode ? (
        <div className="grid items-center gap-6 rounded-lg border border-border p-4 sm:grid-cols-[auto_1fr] sm:p-6">
          <div className="mx-auto rounded-xl border border-border bg-white p-3 shadow-sm">
            {connection.qrCode.startsWith("data:image") ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR data URI generated by the service.
              <img src={connection.qrCode} alt="QR Code para conectar o WhatsApp" className="size-52 max-w-full" />
            ) : (
              <QrCode className="size-52 text-black" />
            )}
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-body font-semibold">Leia o QR Code com o seu celular</h3>
            <ol className="list-decimal space-y-2 pl-5 text-small text-muted-foreground">
              <li>Abra o WhatsApp no celular que será usado no atendimento.</li>
              <li>
                Acesse <strong>Aparelhos conectados</strong> no menu ou nas configurações.
              </li>
              <li>
                Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para este código.
              </li>
            </ol>
            <p role="status" className="flex items-start gap-2 rounded-md bg-secondary p-3 text-small">
              <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-brand-600 motion-reduce:animate-none" />
              Aguardando confirmação do WhatsApp. Após a leitura, esta tela muda automaticamente.
            </p>
            <p className="text-caption text-subtle">
              O QR Code é renovado automaticamente. Mantenha o celular conectado à internet.
            </p>
            {isDev && (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => run("simulate", simulateWhatsAppScanAction)}
              >
                <Smartphone className="size-4" /> Simular leitura do QR (dev)
              </Button>
            )}
          </div>
        </div>
      ) : connected ? (
        <div className="flex flex-col gap-4 rounded-lg border border-success/30 bg-success-soft p-5 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in motion-reduce:animate-none">
          <div className="flex items-center gap-3">
            <CircleCheck className="size-10 shrink-0 text-success" />
            <div>
              <h3 className="font-semibold text-success">WhatsApp conectado!</h3>
              <p className="text-small text-muted-foreground">
                Tudo pronto para receber e responder mensagens no Atendimento.
              </p>
            </div>
          </div>
          <dl className="grid gap-3 text-small sm:grid-cols-2">
            <div>
              <dt className="text-caption text-subtle">Número conectado</dt>
              <dd className="font-medium">{connection.phoneNumber ?? "—"}</dd>
            </div>
            {account.connectedAt && (
              <div>
                <dt className="text-caption text-subtle">Conectado em</dt>
                <dd className="font-medium">{formatDateTime(account.connectedAt)}</dd>
              </div>
            )}
          </dl>
          <Button asChild className="self-start">
            <a href="/app/atendimento">Abrir atendimento</a>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-secondary/50 p-6 text-center">
          <Wifi className="size-10 text-muted-foreground" />
          <p className="text-small text-muted-foreground">
            Clique em conectar para gerar o QR Code e vincular o WhatsApp da clínica.
          </p>
        </div>
      )}
      {connection.status === "ERROR" && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger">
          A conexão não foi concluída. Tente novamente e leia o novo QR Code.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger">
          {error}
        </p>
      )}
      {checkError && (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-small text-warning">
          {checkError}
        </p>
      )}
      {isDev && <p className="text-caption text-subtle">Modo de desenvolvimento: esta conexão é uma simulação.</p>}
    </div>
  );
}
