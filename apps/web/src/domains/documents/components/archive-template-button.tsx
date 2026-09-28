"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { archiveDocumentTemplateAction } from "../actions";

export function ArchiveTemplateButton({ templateId }: { templateId: string }) {
  const [pending, startTransition] = useTransition();

  const archive = () =>
    startTransition(async () => {
      const result = await archiveDocumentTemplateAction(templateId);
      if (result.status === "success") toast.success(result.message);
      else if (result.status === "error") toast.error(result.message);
    });

  return (
    <Button variant="ghost" size="sm" onClick={archive} disabled={pending}>
      {pending ? <Spinner /> : "Arquivar"}
    </Button>
  );
}
