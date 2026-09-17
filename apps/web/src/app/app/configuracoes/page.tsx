import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantContext, type TenantContext } from "@/domains/tenants/context";
import { getTenantDetails } from "@/domains/tenants/queries";
import { createClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/url";
import { AppearanceSettings, ProfileForm, TenantSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Configurações" };

const TABS = [
  { id: "empresa", label: "Empresa" },
  { id: "perfil", label: "Meu perfil" },
  { id: "aparencia", label: "Aparência" },
] as const;

export default async function SettingsPage({ searchParams }: PageProps<"/app/configuracoes">) {
  const context = await requireTenantContext();
  const requested = firstParam((await searchParams).aba);
  const tab = resolveTab(
    requested,
    TABS.map((item) => item.id),
    "empresa",
  );

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Configurações" description="Dados da empresa, seu perfil e preferências de uso." />

      <TabNav
        label="Seções de configurações"
        active={tab}
        items={TABS.map((item) => ({ ...item, href: `/app/configuracoes?aba=${item.id}` }))}
      />

      {tab === "empresa" && <CompanyTab context={context} />}
      {tab === "perfil" && <ProfileTab context={context} />}
      {tab === "aparencia" && (
        <Card>
          <CardHeader>
            <CardTitle>Tema</CardTitle>
            <CardDescription>A preferência fica salva neste navegador.</CardDescription>
          </CardHeader>
          <CardContent>
            <AppearanceSettings />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

async function CompanyTab({ context }: { context: TenantContext }) {
  const details = await getTenantDetails(context);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da empresa</CardTitle>
        <CardDescription>Usados em documentos, comunicações e na identificação da loja.</CardDescription>
      </CardHeader>
      <CardContent>
        <TenantSettingsForm
          canEdit={context.can("tenant.update")}
          initial={{
            name: details.name,
            legalName: details.legalName,
            document: details.document,
            email: details.email,
            phone: details.phone,
            segment: details.segment,
            timezone: details.timezone,
          }}
        />
      </CardContent>
    </Card>
  );
}

async function ProfileTab({ context }: { context: TenantContext }) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, email")
    .eq("id", context.user.id)
    .single();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meu perfil</CardTitle>
        <CardDescription>Seu nome aparece para a equipe e no histórico de ações.</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm
          initial={{ fullName: profile?.full_name ?? "", phone: profile?.phone ?? null, email: profile?.email ?? null }}
        />
      </CardContent>
    </Card>
  );
}
