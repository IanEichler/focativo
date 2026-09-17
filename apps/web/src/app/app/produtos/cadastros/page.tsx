import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Button } from "@/components/ui/button";
import {
  AttributeManager,
  BrandManager,
  CategoryManager,
  SupplierManager,
} from "@/domains/catalog/components/taxonomy-managers";
import { getTaxonomy } from "@/domains/catalog/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Cadastros do catálogo" };

const TABS = ["categorias", "marcas", "fornecedores", "caracteristicas"] as const;

export default async function CatalogTaxonomyPage({ searchParams }: PageProps<"/app/produtos/cadastros">) {
  const context = await requireTenantContext();
  if (!context.can("catalog.read")) {
    return (
      <PageContainer>
        <PageHeader title="Cadastros" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const tab = resolveTab(firstParam((await searchParams).aba), TABS, "categorias");
  const taxonomy = await getTaxonomy(context);
  const canWrite = context.can("catalog.write");
  const base = "/app/produtos/cadastros";

  return (
    <PageContainer className="max-w-6xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href="/app/produtos">
            <ArrowLeft /> Produtos
          </Link>
        </Button>
      </div>
      <PageHeader title="Cadastros do catálogo" description="Categorias, marcas, fornecedores e características dos produtos." />

      <TabNav
        label="Cadastros"
        active={tab}
        items={[
          { id: "categorias", label: "Categorias", href: base, count: taxonomy.categories.length },
          { id: "marcas", label: "Marcas", href: `${base}?aba=marcas`, count: taxonomy.brands.length },
          { id: "fornecedores", label: "Fornecedores", href: `${base}?aba=fornecedores`, count: taxonomy.suppliers.length },
          { id: "caracteristicas", label: "Características", href: `${base}?aba=caracteristicas`, count: taxonomy.attributes.length },
        ]}
      />

      {tab === "categorias" && <CategoryManager categories={taxonomy.categories} canWrite={canWrite} />}
      {tab === "marcas" && <BrandManager brands={taxonomy.brands} canWrite={canWrite} />}
      {tab === "fornecedores" && <SupplierManager suppliers={taxonomy.suppliers} canWrite={canWrite} />}
      {tab === "caracteristicas" && <AttributeManager attributes={taxonomy.attributes} canWrite={canWrite} />}
    </PageContainer>
  );
}
