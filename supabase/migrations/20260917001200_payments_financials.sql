-- =============================================================================
-- FASE 5 · Pagamentos (PaymentProvider, webhooks idempotentes) e financeiro
--
-- Decisão de escopo — cobranças (payments) só existem para RESERVAS, nunca
-- para vendas diretas do PDV. O fluxo do escopo é: cliente → charge → Pix/link
-- → webhook → payment confirmed → sale (a venda nasce DEPOIS da confirmação,
-- nunca antes). Uma venda de balcão com pagamento imediato (dinheiro, cartão
-- na maquininha) já é registrada confirmada na hora (Fase 4, `sale_create`
-- com `payment_method`/`paid_amount` diretos) — não precisa de cobrança
-- assíncrona nem webhook. Duplicar o rastreio de pagamento em `sales` e
-- `payments` para o mesmo caso só divergiria as duas fontes.
--
-- PaymentProvider (createCharge/getCharge/cancelCharge/handleWebhook) é uma
-- interface de aplicação (TypeScript); o banco só guarda o registro da
-- cobrança e garante que confirmar/falhar é idempotente por natureza (o
-- status já confirmado/falho vira no-op, nunca duplica venda nem
-- movimentação — mesmo padrão de reservation_cancel/crm_move_opportunity).
-- Sem credencial de gateway real, a Fase 5 entrega o provider DEV, claramente
-- identificado na UI, mas com o pipeline de webhook de verdade (assinatura
-- HMAC + rota HTTP + RPC via service role) — não é só um mock de tela.
-- =============================================================================

create type public.payment_status as enum ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELED');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reservation_id uuid not null,
  customer_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method ~ '^[a-z][a-z_]{1,29}$'),
  provider text not null default 'dev' check (provider ~ '^[a-z][a-z_]{1,29}$'),
  provider_charge_id text check (provider_charge_id is null or char_length(provider_charge_id) <= 128),
  status public.payment_status not null default 'PENDING',
  confirmed_at timestamptz,
  canceled_at timestamptz,
  failed_reason text check (failed_reason is null or char_length(failed_reason) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_tenant_id_id_key unique (tenant_id, id),
  constraint payments_reservation_fkey foreign key (tenant_id, reservation_id)
    references public.reservations (tenant_id, id) on delete cascade,
  constraint payments_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict
);

create unique index payments_provider_charge_unique
  on public.payments (tenant_id, provider, provider_charge_id) where provider_charge_id is not null;
create index payments_reservation_idx on public.payments (reservation_id);
create index payments_tenant_status_idx on public.payments (tenant_id, status);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- reservation_complete: relaxa a checagem de permissão para permitir o
-- caminho de webhook (auth.uid() nulo). A rota HTTP do webhook já validou a
-- assinatura antes de chamar via service role; sem usuário autenticado, essa
-- é a única autorização possível. O caminho autenticado (staff confirmando
-- manualmente, Fase 4) continua exigindo reservations.write/sales.write/
-- sales.discount exatamente como antes.
-- -----------------------------------------------------------------------------

create or replace function public.reservation_complete(
  p_reservation_id uuid,
  p_payment_method text default null,
  p_paid_amount numeric default null,
  p_discount_amount numeric default 0,
  p_opportunity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reservation public.reservations;
  v_item record;
  v_subtotal numeric := 0;
  v_sale_id uuid;
begin
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_uid is not null and not private.has_tenant_permission(v_reservation.tenant_id, 'reservations.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reservation.status in ('COMPLETED', 'CANCELED', 'EXPIRED') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  if v_uid is not null and not private.has_tenant_permission(v_reservation.tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501', detail = 'sales.write';
  end if;
  if coalesce(p_discount_amount, 0) > 0 and v_uid is not null
     and not private.has_tenant_permission(v_reservation.tenant_id, 'sales.discount') then
    raise exception 'forbidden' using errcode = '42501', detail = 'sales.discount';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_subtotal
  from public.reservation_items where reservation_id = p_reservation_id;
  if coalesce(p_discount_amount, 0) > v_subtotal then
    raise exception 'invalid_input' using errcode = '22023', detail = 'discount_amount';
  end if;

  begin
    insert into public.sales (
      tenant_id, customer_id, reservation_id, origin, subtotal, discount_amount, total,
      payment_method, paid_amount, responsible_user_id, created_by
    ) values (
      v_reservation.tenant_id, v_reservation.customer_id, p_reservation_id, 'BALCAO',
      v_subtotal, coalesce(p_discount_amount, 0), v_subtotal - coalesce(p_discount_amount, 0),
      p_payment_method, p_paid_amount, v_uid, v_uid
    )
    returning id into v_sale_id;
  exception
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'sale';
  end;

  for v_item in select * from public.reservation_items where reservation_id = p_reservation_id loop
    insert into public.sale_items (tenant_id, sale_id, variant_id, quantity, unit_price, unit_cost)
    values (
      v_reservation.tenant_id, v_sale_id, v_item.variant_id, v_item.quantity, v_item.unit_price,
      (select c.cost_price from public.product_variant_costs c
       where c.variant_id = v_item.variant_id and c.tenant_id = v_reservation.tenant_id)
    );

    perform private.apply_stock_movement(
      p_tenant_id => v_reservation.tenant_id,
      p_variant_id => v_item.variant_id,
      p_type => 'SALE',
      p_quantity => v_item.quantity,
      p_origin => 'SALE',
      p_consume_reserved => true,
      p_skip_expired => true,
      p_reference_type => 'sale',
      p_reference_id => v_sale_id,
      p_actor_type => case when v_uid is null then 'SYSTEM' else 'USER' end::public.audit_actor_type,
      p_audit_action => 'sale.item_sold'
    );
  end loop;

  update public.reservations set status = 'COMPLETED', completed_sale_id = v_sale_id where id = p_reservation_id;

  perform private.log_timeline_event(v_reservation.tenant_id, v_reservation.customer_id, 'sale.completed',
    jsonb_build_object('sale_id', v_sale_id, 'reservation_id', p_reservation_id, 'total', v_subtotal - coalesce(p_discount_amount, 0)),
    case when v_uid is null then 'SYSTEM' else null end::public.audit_actor_type);

  if p_opportunity_id is not null then
    perform public.crm_move_opportunity(p_opportunity_id, (
      select id from public.crm_stages where tenant_id = v_reservation.tenant_id and is_won limit 1
    ));
  end if;

  return v_sale_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cobranças: RPCs
-- -----------------------------------------------------------------------------

create or replace function public.payment_create_charge(
  p_tenant_id uuid,
  p_reservation_id uuid,
  p_method text,
  p_provider text default 'dev',
  p_provider_charge_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_reservation public.reservations;
  v_amount numeric;
  v_payment_id uuid;
begin
  if not private.has_tenant_permission(p_tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_reservation from public.reservations
  where id = p_reservation_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'reservation_id';
  end if;
  if v_reservation.status in ('COMPLETED', 'CANCELED', 'EXPIRED') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_amount
  from public.reservation_items where reservation_id = p_reservation_id;
  if v_amount <= 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount';
  end if;

  begin
    insert into public.payments (
      tenant_id, reservation_id, customer_id, amount, method, provider, provider_charge_id, metadata, created_by
    ) values (
      p_tenant_id, p_reservation_id, v_reservation.customer_id, v_amount, p_method,
      coalesce(p_provider, 'dev'), p_provider_charge_id, coalesce(p_metadata, '{}'::jsonb), v_uid
    )
    returning id into v_payment_id;
  exception
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'payment';
  end;

  perform private.log_timeline_event(p_tenant_id, v_reservation.customer_id, 'payment.created',
    jsonb_build_object('payment_id', v_payment_id, 'reservation_id', p_reservation_id, 'amount', v_amount, 'method', p_method));

  return v_payment_id;
end;
$$;

-- O id da cobrança só existe depois do insert acima; quando o provider precisa
-- desse id para gerar o charge_id (caso do DEV), a aplicação chama esta
-- segunda RPC para anexar o retorno do provider (instruções de pagamento,
-- charge_id externo) sem reabrir a tabela para escrita direta.
create or replace function public.payment_attach_provider_info(
  p_payment_id uuid,
  p_provider_charge_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  perform private.require_user();
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_payment.tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_payment.status <> 'PENDING' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  begin
    update public.payments set
      provider_charge_id = p_provider_charge_id,
      metadata = coalesce(p_metadata, '{}'::jsonb)
    where id = p_payment_id;
  exception
    when unique_violation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'provider_charge_id';
  end;
end;
$$;

-- Confirma a cobrança e converte a reserva em venda. Chamável por um usuário
-- autenticado (confirmação manual) OU por auth.uid() nulo (webhook, já
-- verificado na rota HTTP via service role) — idempotente: repetir sobre uma
-- cobrança já CONFIRMED só devolve a venda existente, sem reprocessar nada.
create or replace function public.payment_confirm(p_payment_id uuid, p_provider_charge_id text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_uid is not null and not private.has_tenant_permission(v_payment.tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_payment.status = 'CONFIRMED' then
    return (select completed_sale_id from public.reservations where id = v_payment.reservation_id);
  end if;
  if v_payment.status in ('FAILED', 'CANCELED') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  update public.payments set
    status = 'CONFIRMED',
    confirmed_at = now(),
    provider_charge_id = coalesce(p_provider_charge_id, provider_charge_id)
  where id = p_payment_id;

  return public.reservation_complete(v_payment.reservation_id, v_payment.method, v_payment.amount);
end;
$$;

create or replace function public.payment_fail(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_uid is not null and not private.has_tenant_permission(v_payment.tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_payment.status in ('FAILED', 'CANCELED') then
    return;
  end if;
  if v_payment.status = 'CONFIRMED' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'already_confirmed';
  end if;

  update public.payments set status = 'FAILED', failed_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_payment_id;

  perform private.log_timeline_event(v_payment.tenant_id, v_payment.customer_id, 'payment.failed',
    jsonb_build_object('payment_id', p_payment_id, 'reason', p_reason),
    case when v_uid is null then 'SYSTEM' else null end::public.audit_actor_type);
end;
$$;

create or replace function public.payment_cancel(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  perform private.require_user();
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_payment.tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_payment.status <> 'PENDING' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  update public.payments set status = 'CANCELED', canceled_at = now() where id = p_payment_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Financeiro (V1 operacional básico: receita, recebido, pendente, formas de
-- pagamento, contas a receber — sem contabilidade completa)
-- -----------------------------------------------------------------------------

-- language plpgsql (não sql) de propósito: precisa recusar explicitamente sem
-- financial.read, já que o RLS de sales só exige sales.read (que o VENDEDOR
-- também tem) — depender só do RLS vazaria receita agregada para quem não
-- deveria ver o financeiro.
create or replace function public.financial_summary(p_tenant_id uuid, p_since date default null)
returns table (
  revenue numeric,
  received numeric,
  pending numeric,
  sales_count bigint,
  by_method jsonb
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
  with scoped as (
    select * from public.sales s
    where s.tenant_id = p_tenant_id and s.canceled_at is null
      and (p_since is null or s.created_at >= p_since)
  )
  select
    coalesce(sum(total), 0) as revenue,
    coalesce(sum(coalesce(paid_amount, 0)), 0) as received,
    coalesce(sum(total - coalesce(paid_amount, 0)), 0) as pending,
    count(*) as sales_count,
    coalesce(
      (select jsonb_object_agg(method, total) from (
        select coalesce(payment_method, 'nao_informado') as method, sum(total) as total
        from scoped group by coalesce(payment_method, 'nao_informado')
      ) m),
      '{}'::jsonb
    ) as by_method
  from scoped;
end;
$$;

create or replace function public.sales_receivables(p_tenant_id uuid)
returns table (
  sale_id uuid,
  customer_id uuid,
  customer_name text,
  total numeric,
  paid_amount numeric,
  balance numeric,
  created_at timestamptz
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
  select s.id, s.customer_id, c.name, s.total, coalesce(s.paid_amount, 0), s.total - coalesce(s.paid_amount, 0), s.created_at
  from public.sales s
  left join public.customers c on c.id = s.customer_id
  where s.tenant_id = p_tenant_id and s.canceled_at is null and coalesce(s.paid_amount, 0) < s.total
  order by s.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('financial.read', 'financial', 'Visualizar o painel financeiro (receita, recebido, contas a receber)');

insert into public.role_permissions (role_code, permission_code)
select r.code, 'financial.read' from public.roles r where r.code in ('OWNER', 'ADMIN', 'GERENTE');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.payments enable row level security;

create policy payments_select on public.payments for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('sales.read')));

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.payment_create_charge(uuid, uuid, text, text, text, jsonb),
  public.payment_attach_provider_info(uuid, text, jsonb),
  public.payment_confirm(uuid, text),
  public.payment_fail(uuid, text),
  public.payment_cancel(uuid),
  public.financial_summary(uuid, date),
  public.sales_receivables(uuid)
from public, anon;

grant execute on function
  public.payment_create_charge(uuid, uuid, text, text, text, jsonb),
  public.payment_attach_provider_info(uuid, text, jsonb),
  public.payment_cancel(uuid),
  public.financial_summary(uuid, date),
  public.sales_receivables(uuid)
to authenticated, service_role;

-- payment_confirm/payment_fail também são chamadas pela rota de webhook via
-- service_role (auth.uid() nulo); authenticated cobre a confirmação manual.
grant execute on function
  public.payment_confirm(uuid, text),
  public.payment_fail(uuid, text)
to authenticated, service_role;
