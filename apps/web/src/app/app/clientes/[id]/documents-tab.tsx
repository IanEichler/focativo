import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadDocumentButton, DownloadPdfButton } from "@/domains/documents/components/download-document-button";
import { listCustomerDocuments, listDocumentTemplates } from "@/domains/documents/queries";
import type { TenantContext } from "@/domains/tenants/context";
import { formatDateTime } from "@/lib/format";
import { SignatureControls } from "@/domains/signatures/components/signature-controls";

export async function DocumentsTab({ context, customerId }: { context: TenantContext; customerId: string }) {
  if (!context.can("documents.read") || !context.hasModule("documents")) {
    return (
      <EmptyState className="border-0" title="Sem acesso" description="Você não tem permissão para ver documentos." />
    );
  }

  const [documents, templates] = await Promise.all([
    listCustomerDocuments(context, customerId),
    listDocumentTemplates(context),
  ]);
  const canWrite = context.can("documents.write");

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Novo contrato</CardTitle>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={<FileText />}
                title="Nenhum modelo de contrato cadastrado"
                description="Cadastre um modelo Word para preencher os dados desta cliente e gerar PDF e DOCX."
                action={
                  <Button asChild>
                    <Link href="/app/documentos">
                      <Plus /> Cadastrar modelo
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {templates.map((template) => (
                  <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="font-medium">{template.name}</span>
                    <Button asChild size="sm">
                      <Link href={`/app/documentos/${template.id}/gerar?clienteId=${customerId}`}>
                        <Plus /> Preencher contrato
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Contratos gerados</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={<FileText />}
              title="Nenhum contrato gerado"
              description="Os contratos gerados para esta cliente aparecerão aqui."
            />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {documents.map((document) => (
                <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="flex flex-col">
                    <span className="font-medium">{document.name}</span>
                    <span className="text-small text-muted-foreground">
                      {document.templateName ? `${document.templateName} · ` : ""}
                      {formatDateTime(document.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DownloadPdfButton documentId={document.id} />
                    <DownloadDocumentButton documentId={document.id} />
                  </div>
                  <SignatureControls documentId={document.id} canWrite={canWrite} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
