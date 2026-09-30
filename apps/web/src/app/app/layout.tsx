import { TriangleAlert } from "lucide-react";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { SIDEBAR_COOKIE } from "@/components/layout/constants";
import { APP_NAV, filterNav, navCommands, reorderNav } from "@/components/layout/nav-config";
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

  const sections = reorderNav(filterNav(APP_NAV, context.permissions, context.hasModule), context.user.navOrder);

  return (
    <AppShell
      sections={sections}
      rootHref="/app/dashboard"
      defaultCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "1"}
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
