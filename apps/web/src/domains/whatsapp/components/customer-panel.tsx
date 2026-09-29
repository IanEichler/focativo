import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronRight, IdCard, Mail, MessageCircle, ShoppingBag, Target, Ticket, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import type { CustomerDetail } from "@/domains/customers/queries";
import type { OpportunityCard } from "@/domains/crm/queries";
import type { ReservationListItem } from "@/domains/reservations/queries";
import type { SaleListItem } from "@/domains/sales/queries";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { maskCpfCnpj, maskPhone } from "@/lib/masks";
import { contactPhone } from "../contact-identity";

const cardClass = "rounded-xl border border-border bg-card p-3";
const linkClass = "flex min-w-0 items-center gap-2 rounded-lg border border-border p-3 text-small outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";

export function CustomerPanel({ customer, opportunities, reservations, sales }: {
  customer: CustomerDetail;
  opportunities: OpportunityCard[];
  reservations: ReservationListItem[];
  sales: SaleListItem[];
}) {
  const phone = contactPhone(customer.whatsapp, customer.whatsappChatId) ?? contactPhone(customer.phone, customer.whatsappChatId);
  return (
    <aside aria-label="Resumo da cliente" className="flex h-full min-h-0 flex-col bg-secondary/20 text-foreground">
      <header className="shrink-0 border-b border-border bg-card p-4">
        <p className="mb-3 flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
          <UserRound className="size-3.5" aria-hidden="true" /> Perfil da cliente
        </p>
        <div className="flex items-center gap-3">
          <Avatar className="size-12 shrink-0 rounded-xl">
            {customer.avatarUrl && <AvatarImage src={customer.avatarUrl} alt="" />}
            <AvatarFallback className="rounded-xl bg-info-soft text-base font-semibold text-info">{initials(customer.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold leading-snug">{customer.name}</h2>
            <p className="mt-1 text-caption text-muted-foreground">Cliente desde {formatDate(customer.createdAt)}</p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-4 w-full justify-between bg-background">
          <Link href={`/app/clientes/${customer.id}`}>Ver perfil completo <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]">
        <section aria-label="Dados de contato" className={cardClass}>
          <dl className="space-y-3">
            <Contact icon={<MessageCircle className="size-4 text-success" />} label="WhatsApp" value={phone ? maskPhone(phone) : "Não informado"} />
            {customer.email && <Contact icon={<Mail className="size-4" />} label="E-mail" value={customer.email} />}
            {customer.document && <Contact icon={<IdCard className="size-4" />} label="CPF/CNPJ" value={maskCpfCnpj(customer.document)} />}
          </dl>
          {customer.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-3">
              {customer.tags.map(tag => <StatusBadge key={tag} tone="info" dot={false} className="h-auto min-h-6 max-w-full whitespace-normal break-words">{tag}</StatusBadge>)}
            </div>
          )}
        </section>
        <section aria-label="Resumo de compras" className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-caption font-medium text-muted-foreground">Total em compras</h3>
            <ShoppingBag className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="mt-1 break-words text-xl font-semibold tracking-tight tabular-nums">{formatMoney(customer.totalSpent)}</p>
          <p className="mt-0.5 text-caption text-muted-foreground">{customer.purchaseCount === 0 ? "Nenhuma compra registrada até agora" : `${customer.purchaseCount} ${customer.purchaseCount === 1 ? "compra registrada" : "compras registradas"}`}</p>
          {customer.purchaseCount > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-caption">
              <div><dt className="text-muted-foreground">Ticket médio</dt><dd className="mt-1 break-words font-medium tabular-nums">{customer.averageTicket !== null ? formatMoney(customer.averageTicket) : "—"}</dd></div>
              <div><dt className="text-muted-foreground">Última compra</dt><dd className="mt-1 font-medium tabular-nums">{formatDate(customer.lastPurchaseAt)}</dd></div>
            </dl>
          )}
        </section>
        <section className={cardClass}>
          <h3 className="mb-3 flex items-center gap-2 text-small font-semibold">
            <Target className="size-4 text-info" aria-hidden="true" /> Oportunidades <Count value={opportunities.length} />
          </h3>
          {opportunities.length === 0 ? <p className="text-caption text-muted-foreground">Nenhuma oportunidade vinculada.</p> : (
            <div className="space-y-2">
              {opportunities.map(opportunity => (
                <Link key={opportunity.id} href="/app/crm" className={linkClass}>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{opportunity.title?.trim() || `Atendimento de ${customer.name}`}</p>
                    <p className="mt-1 text-caption text-muted-foreground">Atualizada em {formatDate(opportunity.updatedAt)}</p>
                    {opportunity.estimatedValue !== null && <p className="mt-1 font-medium tabular-nums">{formatMoney(opportunity.estimatedValue)}</p>}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </section>
        <History title="Reservas" icon={<Ticket className="size-4" />} items={reservations} baseHref="/app/reservas" empty="Nenhuma reserva registrada." />
        <History title="Compras" icon={<ShoppingBag className="size-4" />} items={sales} baseHref="/app/vendas" empty="Nenhuma compra registrada." />
      </div>
    </aside>
  );
}

function Contact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-2.5 text-caption text-muted-foreground">
        <span className="shrink-0" aria-hidden="true">{icon}</span>{label}
      </dt>
      <dd className="mt-0.5 pl-6.5 text-small font-medium tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function Count({ value }: { value: number }) {
  return <span className="ml-auto rounded-md bg-secondary px-1.5 py-0.5 text-caption font-medium text-muted-foreground tabular-nums">{value}</span>;
}

function History({ title, icon, items, baseHref, empty }: {
  title: string; icon: React.ReactNode; items: { id: string; createdAt: string; total: number }[]; baseHref: string; empty: string;
}) {
  return (
    <details className={`${cardClass} group/history`} open={items.length > 0}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-small font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground" aria-hidden="true">{icon}</span>{title}<Count value={items.length} />
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/history:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 space-y-2">
        {items.length === 0 && <p className="text-caption text-muted-foreground">{empty}</p>}
        {items.map(item => (
          <Link key={item.id} href={`${baseHref}/${item.id}`} className={linkClass}>
            <span className="flex-1 text-muted-foreground">{formatDate(item.createdAt)}</span>
            <span className="font-medium tabular-nums">{formatMoney(item.total)}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}
