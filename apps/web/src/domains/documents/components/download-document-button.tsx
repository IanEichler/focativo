"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getCustomerDocumentDownloadUrlAction } from "../actions";

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
      {pending ? <Spinner /> : "Baixar"}
    </Button>
  );
}
