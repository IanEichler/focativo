import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";

export function AccessDenied({
  description = "Seu papel nesta empresa não permite acessar esta área. Fale com o proprietário ou um administrador.",
}: {
  description?: string;
}) {
  return (
    <EmptyState
      icon={<Lock />}
      title="Acesso restrito"
      description={description}
      action={
        <Button variant="outline" asChild>
          <Link href="/app/dashboard">Voltar ao dashboard</Link>
        </Button>
      }
    />
  );
}
