import { ShieldCheck } from "lucide-react";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { SIDEBAR_COOKIE } from "@/components/layout/constants";
import { ADMIN_NAV, navCommands } from "@/components/layout/nav-config";
import { Topbar } from "@/components/layout/topbar";
import { UserMenu } from "@/components/layout/user-menu";
import { requireSuperAdmin } from "@/domains/admin/guard";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireSuperAdmin();
  const cookieStore = await cookies();

  return (
    <AppShell
      sections={ADMIN_NAV}
      rootHref="/admin"
      defaultCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "1"}
      sidebarFooter={
        <div className="flex items-center gap-2.5 rounded-lg p-1.5 [[data-collapsed=true]_&]:justify-center">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col [[data-collapsed=true]_&]:hidden">
            <span className="truncate text-body font-medium">Plataforma</span>
            <span className="truncate text-caption text-muted-foreground">Super Admin</span>
          </span>
        </div>
      }
      topbar={
        <Topbar
          commands={navCommands(ADMIN_NAV, "Administração")}
          context={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft px-2.5 py-1 text-caption font-medium text-info">
              <ShieldCheck className="size-3.5" aria-hidden="true" /> Administração da plataforma
            </span>
          }
          end={<UserMenu name={admin.fullName} email={admin.email} isSuperAdmin area="admin" />}
        />
      }
    >
      {children}
    </AppShell>
  );
}
