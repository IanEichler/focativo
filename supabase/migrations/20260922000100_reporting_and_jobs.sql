-- =============================================================================
-- FASE 8 · Relatórios/inteligência comercial e jobs em segundo plano
--
-- Relatórios (report_*) são funções de LEITURA que agregam dados já existentes
-- em sales/sale_items/crm_opportunities/agenda_appointments — sem nenhuma
-- tabela nova de "estatísticas" pré-computadas (mesmo espírito de
-- financial_summary/sales_receivables da Fase 5: agregado ao vivo, nunca uma
-- segunda fonte de verdade que pode divergir). Todas exigem `financial.read`,
-- o mesmo nível de permissão da página Financeiro — são visões agregadas do
-- comercial, não listagens operacionais (que já são cobertas por sales.read/
-- reservations.read/agenda.read em suas próprias páginas).
--
-- Jobs: até aqui, reservas vencidas só eram varridas quando ALGUÉM abria
-- `/app/reservas` (reservations_expire_due, chamado da própria página — ver
-- Fase 4). Isso deixava reservas presas (e estoque reservado sem liberar)
-- indefinidamente se ninguém abrisse a tela. Extraímos o laço de expiração
-- para uma função privada reutilizável e adicionamos uma varredura global
-- (reservations_expire_due_sweep, só service_role) chamada por um processo
-- PM2 dedicado (services/jobs) a cada poucos minutos — mesmo padrão de
-- isolamento do services/whatsapp (Fase 6): se o job cair, o app continua
-- funcionando normalmente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reservas: extrai o laço de expiração para reuso pelo job global
-- -----------------------------------------------------------------------------

create or replace function private.expire_reservations_for_tenant(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation record;
  v_item record;
  v_count integer := 0;
begin
  for v_reservation in
    select * from public.reservations
    where tenant_id = p_tenant_id
      and status in ('PENDING', 'CONFIRMED', 'AWAITING_PICKUP')
      and expires_at is not null and expires_at < now()
    for update
  loop
    for v_item in select * from public.reservation_items where reservation_id = v_reservation.id loop
      perform private.apply_stock_movement(
        p_tenant_id => p_tenant_id,
        p_variant_id => v_item.variant_id,
        p_type => 'RESERVATION_RELEASE',
        p_quantity => v_item.quantity,
        p_origin => 'RESERVATION',
        p_reference_type => 'reservation',
        p_reference_id => v_reservation.id,
        p_actor_type => 'SYSTEM',
        p_audit_action => 'reservation.expired'
      );
    end loop;
    update public.reservations set status = 'EXPIRED' where id = v_reservation.id;
    perform private.log_timeline_event(p_tenant_id, v_reservation.customer_id, 'reservation.expired',
      jsonb_build_object('reservation_id', v_reservation.id), 'SYSTEM');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Caminho autenticado (staff abrindo /app/reservas) — mesma assinatura e
-- checagem de permissão de antes, agora só delega o laço para o helper.
create or replace function public.reservations_expire_due(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'reservations.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.expire_reservations_for_tenant(p_tenant_id);
end;
$$;

-- Caminho de job (service_role, sem usuário autenticado) — varre TODOS os
-- tenants de uma vez, independente de status (mesmo um tenant suspenso pode
-- ter estoque preso numa reserva vencida).
create or replace function public.reservations_expire_due_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant record;
  v_total integer := 0;
begin
  if (select auth.uid()) is not null then
    raise exception 'forbidden' using errcode = '42501', detail = 'service_only';
  end if;

  for v_tenant in select id from public.tenants loop
    v_total := v_total + private.expire_reservations_for_tenant(v_tenant.id);
  end loop;

  return v_total;
end;
$$;

-- -----------------------------------------------------------------------------
-- Relatórios / inteligência comercial
-- -----------------------------------------------------------------------------

create or replace function public.report_sales_by_day(p_tenant_id uuid, p_since date default null, p_until date default null)
returns table (day date, sales_count bigint, revenue numeric)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select s.created_at::date as day, count(*) as sales_count, coalesce(sum(s.total), 0) as revenue
  from public.sales s
  where s.tenant_id = p_tenant_id and s.canceled_at is null
    and (p_since is null or s.created_at >= p_since)
    and (p_until is null or s.created_at < p_until + 1)
  group by s.created_at::date
  order by day;
end;
$$;

create or replace function public.report_top_products(p_tenant_id uuid, p_since date default null, p_limit integer default 10)
returns table (variant_id uuid, product_name text, variant_name text, quantity_sold numeric, revenue numeric)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select si.variant_id, p.name, pv.name, sum(si.quantity), sum(si.line_total)
  from public.sale_items si
  join public.sales s on s.tenant_id = si.tenant_id and s.id = si.sale_id
  join public.product_variants pv on pv.tenant_id = si.tenant_id and pv.id = si.variant_id
  join public.products p on p.tenant_id = si.tenant_id and p.id = pv.product_id
  where si.tenant_id = p_tenant_id and s.canceled_at is null
    and (p_since is null or s.created_at >= p_since)
  group by si.variant_id, p.name, pv.name
  order by sum(si.line_total) desc
  limit greatest(coalesce(p_limit, 10), 1);
end;
$$;

create or replace function public.report_top_customers(p_tenant_id uuid, p_since date default null, p_limit integer default 10)
returns table (customer_id uuid, customer_name text, purchase_count bigint, total_spent numeric)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select s.customer_id, c.name, count(*), sum(s.total)
  from public.sales s
  join public.customers c on c.tenant_id = s.tenant_id and c.id = s.customer_id
  where s.tenant_id = p_tenant_id and s.canceled_at is null and s.customer_id is not null
    and (p_since is null or s.created_at >= p_since)
  group by s.customer_id, c.name
  order by sum(s.total) desc
  limit greatest(coalesce(p_limit, 10), 1);
end;
$$;

create or replace function public.report_crm_funnel(p_tenant_id uuid, p_since date default null)
returns table (
  stage_id uuid, stage_name text, stage_color text, sort_order integer,
  opportunity_count bigint, won_count bigint, lost_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select st.id, st.name, st.color, st.sort_order,
    count(o.id) as opportunity_count,
    count(o.id) filter (where o.won_at is not null) as won_count,
    count(o.id) filter (where o.lost_at is not null) as lost_count
  from public.crm_stages st
  left join public.crm_opportunities o on o.tenant_id = st.tenant_id and o.stage_id = st.id
    and (p_since is null or o.created_at >= p_since)
  where st.tenant_id = p_tenant_id and st.is_active
  group by st.id, st.name, st.color, st.sort_order
  order by st.sort_order;
end;
$$;

create or replace function public.report_agenda_summary(p_tenant_id uuid, p_since date default null)
returns table (appointments_count bigint, completed_count bigint, no_show_count bigint, canceled_count bigint, revenue numeric)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    count(*) as appointments_count,
    count(*) filter (where a.status = 'COMPLETED') as completed_count,
    count(*) filter (where a.status = 'NO_SHOW') as no_show_count,
    count(*) filter (where a.status = 'CANCELED') as canceled_count,
    coalesce(sum(sv.price) filter (where a.status = 'COMPLETED'), 0) as revenue
  from public.agenda_appointments a
  join public.agenda_services sv on sv.tenant_id = a.tenant_id and sv.id = a.service_id
  where a.tenant_id = p_tenant_id
    and (p_since is null or a.starts_at >= p_since);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões / grants
-- -----------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon;

revoke all on function
  public.reservations_expire_due(uuid),
  public.reservations_expire_due_sweep(),
  public.report_sales_by_day(uuid, date, date),
  public.report_top_products(uuid, date, integer),
  public.report_top_customers(uuid, date, integer),
  public.report_crm_funnel(uuid, date),
  public.report_agenda_summary(uuid, date)
from public, anon;

grant execute on function
  public.reservations_expire_due(uuid),
  public.reservations_expire_due_sweep(),
  public.report_sales_by_day(uuid, date, date),
  public.report_top_products(uuid, date, integer),
  public.report_top_customers(uuid, date, integer),
  public.report_crm_funnel(uuid, date),
  public.report_agenda_summary(uuid, date)
to authenticated, service_role;
