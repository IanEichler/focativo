"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { archiveCustomerAction } from "../actions";

/** Ação própria, separada de excluir — reversível, sem confirmação extra. */
export function ArchiveCustomerButton({ customerId, archived }: { customerId: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    startTransition(async () => {
      const result = await archiveCustomerAction(customerId, !archived);
      if (result.status === "success") {
        toast.success(result.message);
        router.refresh();
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button variant="outline" disabled={pending} onClick={toggle}>
      {pending ? <Spinner /> : archived ? <ArchiveRestore /> : <Archive />}
      {archived ? "Reativar" : "Arquivar"}
    </Button>
  );
}
