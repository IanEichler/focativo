import { Compass } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-6">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <EmptyState
          className="max-w-md"
          icon={<Compass />}
          title="Página não encontrada"
          description="O endereço pode estar incorreto ou a página não está disponível para a sua conta."
          action={
            <Button asChild>
              <Link href="/app/dashboard">Ir para o painel</Link>
            </Button>
          }
        />
      </main>
    </div>
  );
}
