import type { Metadata } from "next";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { StatusBadge, type StatusTone } from "@/components/data/status-badge";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { requireTenantContext } from "@/domains/tenants/context";
import { CreateUserDialog } from "@/domains/users/components/create-user-dialog";
import { InviteUserDialog } from "@/domains/users/components/invite-user-dialog";
import { MemberActions, MemberRoleSelect } from "@/domains/users/components/member-controls";
import { listAssignableRoles, listTenantMembers, type TenantMemberDTO } from "@/domains/users/queries";
import { formatDate, initials } from "@/lib/format";

export const metadata: Metadata = { title: "Usuários" };

const STATUS: Record<TenantMemberDTO["status"], { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "Ativo", tone: "success" },
  INVITED: { label: "Convite pendente", tone: "info" },
  DISABLED: { label: "Desativado", tone: "neutral" },
};

export default async function UsersPage() {
  const context = await requireTenantContext();

  if (!context.can("users.read")) {
    return (
      <PageContainer>
        <PageHeader title="Usuários" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const [members, assignableRoles] = await Promise.all([listTenantMembers(context), listAssignableRoles(context)]);
  const canManage = context.can("users.manage");
  const actorRank = members.find((member) => member.isCurrentUser)?.roleRank ?? 0;
  const actorIsOwner = context.tenant.roleCode === "OWNER";

  // Espelha a regra do banco apenas para exibir controles; o banco revalida.
  const manageable = (member: TenantMemberDTO) =>
    canManage && !member.isCurrentUser && (actorIsOwner || member.roleRank < actorRank);

  const columns: DataTableColumn<TenantMemberDTO>[] = [
    {
      id: "user",
      header: "Usuário",
      cell: (member) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="bg-secondary text-caption font-semibold">
              {initials(member.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">
              {member.fullName}
              {member.isCurrentUser && (
                <span className="ml-1.5 text-small font-normal text-muted-foreground">(você)</span>
              )}
            </span>
            {member.email && <span className="truncate text-small text-muted-foreground">{member.email}</span>}
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Papel",
      cell: (member) =>
        manageable(member) ? (
          <MemberRoleSelect
            membershipId={member.membershipId}
            memberName={member.fullName}
            currentRole={member.roleCode}
            currentRoleName={member.roleName}
            roles={assignableRoles}
          />
        ) : (
          <span>{member.roleName}</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (member) => <StatusBadge tone={STATUS[member.status].tone}>{STATUS[member.status].label}</StatusBadge>,
    },
    {
      id: "since",
      header: "Desde",
      hideBelow: "md",
      cell: (member) => (
        <span className="text-muted-foreground tabular">
          {member.joinedAt
            ? formatDate(member.joinedAt)
            : member.invitedAt
              ? `Convidado em ${formatDate(member.invitedAt)}`
              : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      className: "w-12",
      cell: (member) =>
        manageable(member) ? (
          <MemberActions membershipId={member.membershipId} memberName={member.fullName} status={member.status} />
        ) : null,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Usuários"
        description="Gerencie quem acessa a empresa e o que cada pessoa pode fazer."
        actions={
          context.can("users.invite") ? (
            <div className="flex flex-wrap gap-2">
              <CreateUserDialog />
              <InviteUserDialog roles={assignableRoles} />
            </div>
          ) : undefined
        }
      />
      <DataTable
        caption="Usuários da empresa"
        columns={columns}
        rows={members}
        getRowKey={(member) => member.membershipId}
      />
    </PageContainer>
  );
}
