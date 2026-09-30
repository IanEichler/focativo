import { PageContainer, PageHeader } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgendaLoading() {
  return (
    <PageContainer>
      <PageHeader title="Agenda" description="Organize os atendimentos e acompanhe cada sessão." />
      <div role="status" aria-label="Carregando agenda" className="flex flex-col gap-5">
        <span className="sr-only">Carregando agenda…</span>
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-6 w-56" />
        <div className="rounded-2xl border border-border p-4">
          <Skeleton className="mb-5 h-6 w-48" />
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="mb-3 h-28 rounded-xl last:mb-0" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
