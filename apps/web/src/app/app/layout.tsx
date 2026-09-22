import { TriangleAlert } from "lucide-react";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { SIDEBAR_COOKIE } from "@/components/layout/constants";
import { APP_NAV, filterNav, navCommands } from "@/components/layout/nav-config";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
import { Topbar } from "@/components/layout/topbar";
import { UserMenu } from "@/components/layout/user-menu";
import { isSuperAdmin } from "@/domains/auth/session";
import { NotificationsBell } from "@/domains/notifications/components/notifications-bell";
import { getNotifications } from "@/domains/notifications/queries";
import { requireTenantContext } from "@/domains/tenants/context";

export default async function TenantAppLayout({ children }: LayoutProps<"/app">) {
  const context = await requireTenantContext();
  const [superAdmin, cookieStore, notifications] = await Promise.all([
    isSuperAdmin(),
    cookies(),
    getNotifications(context),
  ]);

  const sections = filterNav(APP_NAV, context.permissions, context.hasModule);
  const current = { id: context.tenant.id, name: context.tenant.name, roleName: context.tenant.roleName };

  return (
    <AppShell
      sections={sections}
      rootHref="/app/dashboard"
      defaultCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "1"}
      sidebarFooter={
        <TenantSwitcher
          current={current}
          options={context.memberships.map((m) => ({ id: m.id, name: m.name, roleName: m.roleName }))}
        />
      }
      topbar={
        <Topbar
          commands={navCommands(sections, "Navegação")}
          end={
            <>
              <NotificationsBell items={notifications} />
              <UserMenu name={context.user.fullName} email={context.user.email} isSuperAdmin={superAdmin} area="app" />
            </>
          }
        />
      }
      banner={
        context.tenant.status === "SUSPENDED" ? (
          <div
            role="status"
            className="flex items-center gap-2 border-b border-border bg-warning-soft px-4 py-2.5 text-body text-warning lg:px-8"
          >
            <TriangleAlert className="size-4 shrink-0" />
            Esta empresa está suspensa. O acesso está em modo somente leitura — fale com o suporte para regularizar.
          </div>
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
