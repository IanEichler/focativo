"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getCustomerDocumentDownloadUrlAction, getCustomerDocumentPdfAction } from "../actions";

export function DownloadDocumentButton({ documentId }: { documentId: string }) {
  const [pending, startTransition] = useTransition();

  const download = () =>
    startTransition(async () => {
      const url = await getCustomerDocumentDownloadUrlAction(documentId);
      if (!url) {
        toast.error("Não foi possível baixar esse documento.");
        return;
      }
      window.location.assign(url);
    });

  return (
    <Button variant="ghost" size="sm" onClick={download} disabled={pending}>
      {pending ? <Spinner /> : "Word"}
    </Button>
  );
}

export function DownloadPdfButton({ documentId }: { documentId: string }) {
  const [pending, startTransition] = useTransition();

  const download = () =>
    startTransition(async () => {
      const result = await getCustomerDocumentPdfAction(documentId);
      if (result.status === "error") {
        toast.error("Não foi possível gerar o PDF desse contrato.");
        return;
      }
      const bytes = Uint8Array.from(atob(result.fileBase64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });

  return (
    <Button variant="ghost" size="sm" onClick={download} disabled={pending}>
      {pending ? <Spinner /> : "PDF"}
    </Button>
  );
}
