"use client";

import { RotateCcw, ServerCrash } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer>
      <EmptyState
        icon={<ServerCrash />}
        title="Não foi possível carregar esta página"
        description={
          <>
            Tente novamente em instantes. Se o problema continuar, informe o código ao suporte.
            {error.digest && <span className="mt-2 block font-mono text-caption">Código: {error.digest}</span>}
          </>
        }
        action={
          <Button variant="outline" onClick={reset}>
            <RotateCcw /> Tentar novamente
          </Button>
        }
      />
    </PageContainer>
  );
}
