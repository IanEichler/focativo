"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, FileCheck2, Link2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { createSignatureLinkAction, downloadSignedContractAction, revokeSignatureAction, signatureStatusAction } from "../actions";
import { formatDateTime } from "@/lib/format";

type Summary = Awaited<ReturnType<typeof signatureStatusAction>>;
export function SignatureControls({ documentId, canWrite = true, initialUrl = "" }: { documentId: string; canWrite?: boolean; initialUrl?: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void signatureStatusAction(documentId).then(result => { if (active) setSummary(result); })
      .catch(() => { if (active) setError("Não foi possível consultar a assinatura."); });
    return () => { active = false; };
  }, [documentId]);
  function run(task: () => Promise<void>) {
    start(async () => { setError(""); try { await task(); } catch { setError("Não foi possível concluir. Tente novamente."); } });
  }
  const row = summary?.status === "success" ? summary.signature : null;
  const expired = summary?.status === "success" && summary.expired;
  const status = row?.status === "SIGNED" ? "Assinado" : expired ? "Link expirado" : row?.status === "PENDING" ? "Aguardando assinatura" : row?.status === "REVOKED" ? "Link cancelado" : "Não solicitado";
  return <div className="flex w-full flex-col gap-2 rounded-lg border border-border p-3 text-small">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">Assinatura eletrônica</span>
      {row && <StatusBadge tone={row.status === "SIGNED" ? "success" : row.status === "PENDING" && !expired ? "warning" : "neutral"}>{status}</StatusBadge>}
      <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label="Atualizar status da assinatura"
        onClick={() => run(async () => { setSummary(await signatureStatusAction(documentId)); })}><RefreshCw className="size-4" /></Button>
    </div>
    {summary?.status === "error" && <p role="alert">{summary.message}</p>}
    {summary?.status === "success" && !row && <p>Este contrato é anterior ao assinador. Gere uma nova versão para solicitar a assinatura.</p>}
    {row && <>
      <p className="text-muted-foreground">Signatária: {row.signer_name} · {row.signer_email || "E-mail não preenchido no contrato"}</p>
      {row.signed_at && <p>Assinado em {formatDateTime(row.signed_at)}</p>}
      {row.status === "PENDING" && row.expires_at && <p>Link válido até {formatDateTime(row.expires_at)}.</p>}
      {canWrite && row.status !== "SIGNED" && summary?.status === "success" && summary.configurationMessage && <p className="text-muted-foreground">{summary.configurationMessage}</p>}
      <div className="flex flex-wrap gap-2">
        {canWrite && row.status !== "SIGNED" && <Button type="button" variant="outline" size="sm" disabled={pending}
          onClick={() => run(async () => {
            const result = await createSignatureLinkAction(documentId);
            if (result.status === "error") { setError(result.message); return; }
            setUrl(result.url); setSummary(await signatureStatusAction(documentId));
          })}><Link2 className="size-4" />{row.status === "PENDING" && !expired ? "Exibir link" : "Gerar link para assinatura"}</Button>}
        {row.status === "SIGNED" && <Button type="button" size="sm" disabled={pending} onClick={() => run(async () => {
          const result = await downloadSignedContractAction(documentId);
          if (result.status === "error") { setError(result.message); return; }
          const blob = new Blob([Uint8Array.from(atob(result.base64), c => c.charCodeAt(0))], { type: "application/pdf" });
          const target = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = target; a.download = result.name; a.click(); setTimeout(() => URL.revokeObjectURL(target), 1000);
        })}><FileCheck2 className="size-4" />Baixar PDF assinado</Button>}
        {canWrite && row.status === "PENDING" && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setCancelOpen(true)}><X className="size-4" />Cancelar link</Button>}
      </div>
    </>}
    {url && row?.status === "PENDING" && <div className="flex flex-wrap gap-2">
      <input aria-label="Link de assinatura" readOnly value={url} className="min-w-0 flex-1 rounded-md border border-input px-2 py-2" onFocus={e => e.target.select()} />
      <Button type="button" size="sm" variant="outline" onClick={() => run(async () => { await navigator.clipboard.writeText(url); toast.success("Link copiado."); })}><Copy className="size-4" />Copiar</Button>
    </div>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancelar link de assinatura?" description="A cliente não poderá mais usar este link. O contrato gerado continuará no perfil." confirmLabel="Cancelar link"
      onConfirm={() => revokeSignatureAction(documentId)} onSuccess={() => run(async () => { setUrl(""); setSummary(await signatureStatusAction(documentId)); })} />
  </div>;
}
