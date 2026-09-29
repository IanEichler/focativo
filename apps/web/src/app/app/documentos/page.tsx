import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { ArchiveTemplateButton } from "@/domains/documents/components/archive-template-button";
import { UploadTemplateDialog } from "@/domains/documents/components/upload-template-dialog";
import { listDocumentTemplates, type DocumentTemplateRow } from "@/domains/documents/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatDate } from "@/lib/format";
import { firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentosPage({ searchParams }: PageProps<"/app/documentos">) {
  const context = await requireTenantContext();
  if (!context.can("documents.read") || !context.hasModule("documents")) {
    return (
      <PageContainer>
        <PageHeader title="Documentos" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const search = await searchParams;
  const clienteId = firstParam(search.clienteId);
  const generateHref = (templateId: string) =>
    clienteId ? `/app/documentos/${templateId}/gerar?clienteId=${clienteId}` : `/app/documentos/${templateId}/gerar`;

  const templates = await listDocumentTemplates(context);
  const canWrite = context.can("documents.write");

  const columns: DataTableColumn<DocumentTemplateRow>[] = [
    {
      id: "name",
      header: "Modelo",
      cell: (template) => <span className="font-medium">{template.name}</span>,
    },
    {
      id: "fields",
      header: "Campos detectados",
      cell: (template) =>
        template.fields.length > 0 ? (
          <span className="text-small text-muted-foreground">{template.fields.join(", ")}</span>
        ) : (
          <span className="text-small text-muted-foreground">Nenhum campo encontrado</span>
        ),
    },
    {
      id: "createdAt",
      header: "Cadastrado em",
      cell: (template) => <span className="text-muted-foreground">{formatDate(template.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (template) => (
        <div className="flex justify-end gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={generateHref(template.id)}>Gerar documento</Link>
          </Button>
          {canWrite && <ArchiveTemplateButton templateId={template.id} />}
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Documentos"
        description="Modelos de contrato/documento em .docx — preenchidos automaticamente com dados do cliente."
      />

      {canWrite && (
        <div className="flex justify-end">
          <UploadTemplateDialog
            trigger={
              <Button>
                <Plus /> Novo modelo
              </Button>
            }
          />
        </div>
      )}

      <DataTable
        caption="Modelos de documento"
        columns={columns}
        rows={templates}
        getRowKey={(template) => template.id}
        empty={
          <EmptyState
            className="border-0"
            icon={<FileText />}
            title="Nenhum modelo cadastrado"
            description="Envie um .docx com campos {assim} para gerar contratos preenchidos automaticamente."
            action={
              canWrite ? (
                <UploadTemplateDialog
                  trigger={
                    <Button>
                      <Plus /> Novo modelo
                    </Button>
                  }
                />
              ) : undefined
            }
          />
        }
      />
    </PageContainer>
  );
}
