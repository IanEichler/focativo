import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadDocumentButton } from "@/domains/documents/components/download-document-button";
import { listCustomerDocuments } from "@/domains/documents/queries";
import type { TenantContext } from "@/domains/tenants/context";
import { formatDateTime } from "@/lib/format";

export async function DocumentsTab({ context, customerId }: { context: TenantContext; customerId: string }) {
  if (!context.can("documents.read") || !context.hasModule("documents")) {
    return (
      <EmptyState className="border-0" title="Sem acesso" description="Você não tem permissão para ver documentos." />
    );
  }

  const documents = await listCustomerDocuments(context, customerId);
  const canWrite = context.can("documents.write");
  const generateHref = `/app/documentos?clienteId=${customerId}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Documentos</CardTitle>
        {canWrite && (
          <Button asChild size="sm">
            <Link href={generateHref}>
              <Plus /> Gerar documento
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={<FileText />}
            title="Nenhum documento gerado"
            description="Gere um contrato ou documento a partir de um modelo salvo."
            action={
              canWrite ? (
                <Button asChild>
                  <Link href={generateHref}>
                    <Plus /> Gerar documento
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {documents.map((document) => (
              <div key={document.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex flex-col">
                  <span className="font-medium">{document.name}</span>
                  <span className="text-small text-muted-foreground">
                    {document.templateName ? `${document.templateName} · ` : ""}
                    {formatDateTime(document.createdAt)}
                  </span>
                </div>
                <DownloadDocumentButton documentId={document.id} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
