-- =============================================================================
-- FASE 4 · Reservas, vendas (PDV), concorrência e transações
--
-- Reaproveita a primitiva private.apply_stock_movement (Fase 2), que já
-- suporta os tipos RESERVATION/RESERVATION_RELEASE/SALE, p_consume_reserved e
-- reference_type/reference_id — desenhada nessa fase antecipando esta. O lock
-- `for update` em stock_levels dentro dela já serializa a concorrência entre
-- reservas/vendas disputando o mesmo saldo (testado nesta fase).
--
-- Decisão de escopo — "pedidos" (seção 93, Fase 4) não vira uma tabela `orders`
-- separada: nenhuma das 98 seções do escopo descreve um pedido com
-- comportamento distinto de uma venda (a seção 44 vai direto de "validar
-- itens" para "criar venda", sem etapa de rascunho persistido). O carrinho do
-- PDV existe só no cliente (estado React); a venda é criada já confirmada,
-- atomicamente. Um "pedido" com ciclo de vida próprio (pendente de pagamento
-- assíncrono) só faz sentido a partir do fluxo assistido por WhatsApp/IA
-- (Fases 6-7), fora do escopo agora. `stock_movement_origin.ORDER` (Fase 2)
-- fica reservado para esse uso futuro.
--
-- Preço e custo são sempre resolvidos no servidor (nunca aceitos do cliente):
-- "validar preço" é a regra 4 da seção 44.
-- =============================================================================

create type public.reservation_status as enum
  ('PENDING', 'CONFIRMED', 'AWAITING_PICKUP', 'COMPLETED', 'EXPIRED', 'CANCELED');

create type public.sale_origin as enum ('WHATSAPP', 'BALCAO', 'MANUAL', 'OTHER');

-- -----------------------------------------------------------------------------
-- Reservas (FK para sales.id adicionada depois: referência circular)
-- -----------------------------------------------------------------------------

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  status public.reservation_status not null default 'PENDING',
  origin text check (origin is null or origin ~ '^[a-z][a-z_]{1,29}$'),
  notes text check (notes is null or char_length(notes) <= 1000),
  expires_at timestamptz,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  completed_sale_id uuid,
  canceled_reason text check (canceled_reason is null or char_length(canceled_reason) <= 500),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_tenant_id_id_key unique (tenant_id, id),
  constraint reservations_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict
);

create unique index reservations_idempotency_key
  on public.reservations (tenant_id, idempotency_key) where idempotency_key is not null;
create index reservations_tenant_status_idx on public.reservations (tenant_id, status);
create index reservations_customer_idx on public.reservations (customer_id);
create index reservations_expires_idx on public.reservations (expires_at)
  where status in ('PENDING', 'CONFIRMED', 'AWAITING_PICKUP') and expires_at is not null;

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function private.set_updated_at();

create table public.reservation_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reservation_id uuid not null,
  variant_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  constraint reservation_items_reservation_fkey foreign key (tenant_id, reservation_id)
    references public.reservations (tenant_id, id) on delete cascade,
  constraint reservation_items_variant_fkey foreign key (tenant_id, variant_id)
    references public.product_variants (tenant_id, id) on delete restrict,
  constraint reservation_items_unique unique (reservation_id, variant_id)
);

-- -----------------------------------------------------------------------------
-- Vendas — já nascem confirmadas (ver decisão de escopo no cabeçalho);
-- "cancelar" uma venda estorna via movimentações RETURN, nunca apaga a linha.
-- -----------------------------------------------------------------------------

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid,
  reservation_id uuid,
  origin public.sale_origin not null default 'BALCAO',
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  total numeric(12, 2) not null check (total >= 0),
  payment_method text check (payment_method is null or payment_method ~ '^[a-z][a-z_]{1,29}$'),
  paid_amount numeric(12, 2) check (paid_amount is null or paid_amount >= 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  responsible_user_id uuid references public.profiles (id) on delete set null,
  canceled_at timestamptz,
  canceled_reason text check (canceled_reason is null or char_length(canceled_reason) <= 500),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_tenant_id_id_key unique (tenant_id, id),
  constraint sales_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete set null,
  constraint sales_discount_within_subtotal check (discount_amount <= subtotal),
  constraint sales_total_matches check (total = subtotal - discount_amount)
);

create unique index sales_idempotency_key on public.sales (tenant_id, idempotency_key) where idempotency_key is not null;
create index sales_tenant_created_idx on public.sales (tenant_id, created_at desc);
create index sales_customer_idx on public.sales (customer_id);
create index sales_reservation_idx on public.sales (reservation_id) where reservation_id is not null;

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function private.set_updated_at();

-- Referências circulares reservations <-> sales, adicionadas depois de ambas existirem.
alter table public.reservations
  add constraint reservations_sale_fkey foreign key (tenant_id, completed_sale_id)
    references public.sales (tenant_id, id) on delete set null;
alter table public.sales
  add constraint sales_reservation_fkey foreign key (tenant_id, reservation_id)
    references public.reservations (tenant_id, id) on delete set null;

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sale_id uuid not null,
  variant_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  line_total numeric(14, 2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  constraint sale_items_sale_fkey foreign key (tenant_id, sale_id)
    references public.sales (tenant_id, id) on delete cascade,
  constraint sale_items_variant_fkey foreign key (tenant_id, variant_id)
    references public.product_variants (tenant_id, id) on delete restrict,
  constraint sale_items_unique unique (sale_id, variant_id)
);

create index sale_items_variant_idx on public.sale_items (tenant_id, variant_id);

create trigger sales_audit_update
  after update on public.sales
  for each row execute function private.audit_row_update('sale', 'tenant_id');
create trigger reservations_audit_update
  after update on public.reservations
  for each row execute function private.audit_row_update('reservation', 'tenant_id');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function private.load_reservation_for_write(p_reservation_id uuid, p_permission text default 'reservations.write')
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
begin
  perform private.require_user();
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_reservation.tenant_id, p_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_reservation;
end;
$$;

-- Preço/custo sempre resolvidos aqui, nunca aceitos do cliente ("validar preço", seção 44).
-- Retorna uma linha por item de entrada com variant_id/quantity/unit_price/unit_cost/tenant_id do produto.
create or replace function private.price_sale_items(p_tenant_id uuid, p_items jsonb)
returns table (variant_id uuid, quantity numeric, unit_price numeric, unit_cost numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_variant_id uuid;
  v_quantity numeric;
  v_price numeric;
  v_cost numeric;
  v_seen uuid[] := '{}';
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_variant_id := (v_item ->> 'variant_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::numeric;
    exception
      when invalid_text_representation then
        raise exception 'invalid_input' using errcode = '22023', detail = 'variant_id';
    end;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    if v_variant_id = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'duplicate_variant';
    end if;
    v_seen := v_seen || v_variant_id;

    select d.current_price into v_price
    from public.product_variant_details d
    where d.variant_id = v_variant_id and d.tenant_id = p_tenant_id;
    if v_price is null then
      raise exception 'not_found' using errcode = 'P0002', detail = 'variant_id';
    end if;

    select c.cost_price into v_cost from public.product_variant_costs c
    where c.variant_id = v_variant_id and c.tenant_id = p_tenant_id;

    variant_id := v_variant_id; quantity := v_quantity; unit_price := v_price; unit_cost := v_cost;
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reservas: RPCs
-- -----------------------------------------------------------------------------

create or replace function public.reservation_create(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_expires_at timestamptz default null,
  p_origin text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_reservation_id uuid;
  v_priced record;
  v_existing_id uuid;
begin
  if not private.has_tenant_permission(p_tenant_id, 'reservations.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and tenant_id = p_tenant_id) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'customer_id';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.reservations
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing_id;
    end if;
  end if;

  begin
    insert into public.reservations (
      tenant_id, customer_id, origin, notes, expires_at, responsible_user_id, created_by, idempotency_key
    )
    values (
      p_tenant_id, p_customer_id, p_origin, nullif(btrim(coalesce(p_notes, '')), ''), p_expires_at, v_uid, v_uid,
      p_idempotency_key
    )
    returning id into v_reservation_id;
  exception
    when unique_violation then
      select id into v_existing_id from public.reservations
      where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
      if v_existing_id is not null then
        return v_existing_id;
      end if;
      raise exception 'invalid_input' using errcode = '22023', detail = 'reservation';
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'reservation';
  end;

  for v_priced in select * from private.price_sale_items(p_tenant_id, p_items) loop
    insert into public.reservation_items (tenant_id, reservation_id, variant_id, quantity, unit_price)
    values (p_tenant_id, v_reservation_id, v_priced.variant_id, v_priced.quantity, v_priced.unit_price);

    perform private.apply_stock_movement(
      p_tenant_id => p_tenant_id,
      p_variant_id => v_priced.variant_id,
      p_type => 'RESERVATION',
      p_quantity => v_priced.quantity,
      p_origin => 'RESERVATION',
      p_reference_type => 'reservation',
      p_reference_id => v_reservation_id,
      p_idempotency_key => case when p_idempotency_key is not null
        then p_idempotency_key || ':' || v_priced.variant_id::text end,
      p_audit_action => 'reservation.item_reserved'
    );
  end loop;

  perform private.log_timeline_event(p_tenant_id, p_customer_id, 'reservation.created',
    jsonb_build_object('reservation_id', v_reservation_id));

  return v_reservation_id;
end;
$$;

-- Avança um passo no fluxo (PENDING -> CONFIRMED -> AWAITING_PICKUP); não mexe em estoque.
create or replace function public.reservation_advance(p_reservation_id uuid, p_status public.reservation_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_allowed boolean;
begin
  v_reservation := private.load_reservation_for_write(p_reservation_id);
  v_allowed := (v_reservation.status = 'PENDING' and p_status = 'CONFIRMED')
    or (v_reservation.status = 'CONFIRMED' and p_status = 'AWAITING_PICKUP');
  if not v_allowed then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  update public.reservations set status = p_status where id = p_reservation_id;
  perform private.log_timeline_event(v_reservation.tenant_id, v_reservation.customer_id, 'reservation.status_changed',
    jsonb_build_object('reservation_id', p_reservation_id, 'status', p_status));
end;
$$;

create or replace function public.reservation_cancel(p_reservation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations;
  v_item record;
begin
  v_reservation := private.load_reservation_for_write(p_reservation_id);
  if v_reservation.status in ('COMPLETED', 'CANCELED', 'EXPIRED') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  for v_item in select * from public.reservation_items where reservation_id = p_reservation_id loop
    perform private.apply_stock_movement(
      p_tenant_id => v_reservation.tenant_id,
      p_variant_id => v_item.variant_id,
      p_type => 'RESERVATION_RELEASE',
      p_quantity => v_item.quantity,
      p_origin => 'RESERVATION',
      p_reference_type => 'reservation',
      p_reference_id => p_reservation_id,
      p_audit_action => 'reservation.item_released'
    );
  end loop;

  update public.reservations set status = 'CANCELED', canceled_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_reservation_id;
  perform private.log_timeline_event(v_reservation.tenant_id, v_reservation.customer_id, 'reservation.canceled',
    jsonb_build_object('reservation_id', p_reservation_id, 'reason', p_reason));
end;
$$;

-- Converte a reserva numa venda (consome o estoque reservado exatamente uma vez).
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
  v_reservation public.reservations;
  v_item record;
  v_subtotal numeric := 0;
  v_sale_id uuid;
begin
  v_reservation := private.load_reservation_for_write(p_reservation_id);
  if v_reservation.status in ('COMPLETED', 'CANCELED', 'EXPIRED') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  if not private.has_tenant_permission(v_reservation.tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501', detail = 'sales.write';
  end if;
  if coalesce(p_discount_amount, 0) > 0 and not private.has_tenant_permission(v_reservation.tenant_id, 'sales.discount') then
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
      p_payment_method, p_paid_amount, (select auth.uid()), (select auth.uid())
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
      p_audit_action => 'sale.item_sold'
    );
  end loop;

  update public.reservations set status = 'COMPLETED', completed_sale_id = v_sale_id where id = p_reservation_id;

  perform private.log_timeline_event(v_reservation.tenant_id, v_reservation.customer_id, 'sale.completed',
    jsonb_build_object('sale_id', v_sale_id, 'reservation_id', p_reservation_id, 'total', v_subtotal - coalesce(p_discount_amount, 0)));

  if p_opportunity_id is not null then
    perform public.crm_move_opportunity(p_opportunity_id, (
      select id from public.crm_stages where tenant_id = v_reservation.tenant_id and is_won limit 1
    ));
  end if;

  return v_sale_id;
end;
$$;

create or replace function public.reservations_expire_due(p_tenant_id uuid)
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
  if not private.has_tenant_permission(p_tenant_id, 'reservations.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

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

-- -----------------------------------------------------------------------------
-- Vendas (PDV): RPCs
-- -----------------------------------------------------------------------------

-- Cria a venda já confirmada (carrinho do PDV vive só no cliente; ver decisão no cabeçalho).
create or replace function public.sale_create(
  p_tenant_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_origin public.sale_origin default 'BALCAO',
  p_discount_amount numeric default 0,
  p_payment_method text default null,
  p_paid_amount numeric default null,
  p_notes text default null,
  p_opportunity_id uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_priced record;
  v_subtotal numeric := 0;
  v_discount numeric := coalesce(p_discount_amount, 0);
  v_sale_id uuid;
  v_existing_id uuid;
begin
  if not private.has_tenant_permission(p_tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_discount > 0 and not private.has_tenant_permission(p_tenant_id, 'sales.discount') then
    raise exception 'forbidden' using errcode = '42501', detail = 'sales.discount';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and tenant_id = p_tenant_id
  ) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'customer_id';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.sales where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing_id;
    end if;
  end if;

  -- price_sale_items valida e resolve tudo antes de qualquer escrita (chamada 2x,
  -- é stable/somente leitura: primeiro para somar, depois para gravar os itens).
  select coalesce(sum(quantity * unit_price), 0) into v_subtotal
  from private.price_sale_items(p_tenant_id, p_items);

  if v_discount > v_subtotal then
    raise exception 'invalid_input' using errcode = '22023', detail = 'discount_amount';
  end if;

  begin
    insert into public.sales (
      tenant_id, customer_id, origin, subtotal, discount_amount, total,
      payment_method, paid_amount, notes, responsible_user_id, created_by, idempotency_key
    ) values (
      p_tenant_id, p_customer_id, coalesce(p_origin, 'BALCAO'), v_subtotal, v_discount, v_subtotal - v_discount,
      p_payment_method, p_paid_amount, nullif(btrim(coalesce(p_notes, '')), ''), v_uid, v_uid, p_idempotency_key
    )
    returning id into v_sale_id;
  exception
    when unique_violation then
      -- Corrida entre duas chamadas concorrentes com a mesma chave: a que perdeu devolve a venda da vencedora.
      select id into v_existing_id from public.sales where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
      if v_existing_id is not null then
        return v_existing_id;
      end if;
      raise exception 'invalid_input' using errcode = '22023', detail = 'sale';
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'sale';
  end;

  for v_priced in select * from private.price_sale_items(p_tenant_id, p_items) loop
    insert into public.sale_items (tenant_id, sale_id, variant_id, quantity, unit_price, unit_cost)
    values (p_tenant_id, v_sale_id, v_priced.variant_id, v_priced.quantity, v_priced.unit_price, v_priced.unit_cost);

    perform private.apply_stock_movement(
      p_tenant_id => p_tenant_id,
      p_variant_id => v_priced.variant_id,
      p_type => 'SALE',
      p_quantity => v_priced.quantity,
      p_origin => 'SALE',
      p_skip_expired => true,
      p_reference_type => 'sale',
      p_reference_id => v_sale_id,
      p_idempotency_key => case when p_idempotency_key is not null
        then p_idempotency_key || ':' || v_priced.variant_id::text end,
      p_audit_action => 'sale.item_sold'
    );
  end loop;

  if p_customer_id is not null then
    perform private.log_timeline_event(p_tenant_id, p_customer_id, 'sale.completed',
      jsonb_build_object('sale_id', v_sale_id, 'total', v_subtotal - v_discount));
  end if;

  if p_opportunity_id is not null then
    perform public.crm_move_opportunity(p_opportunity_id, (
      select id from public.crm_stages where tenant_id = p_tenant_id and is_won limit 1
    ));
  end if;

  perform private.log_audit(p_tenant_id, 'sale.created', 'sale', v_sale_id::text, null,
    jsonb_build_object('total', v_subtotal - v_discount, 'customer_id', p_customer_id));

  return v_sale_id;
end;
$$;

-- Estorna uma venda: devolve o estoque via RETURN (nunca apaga a linha da venda).
create or replace function public.sale_cancel(p_sale_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
begin
  perform private.require_user();
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_sale.tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sale.canceled_at is not null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'already_canceled';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    perform private.apply_stock_movement(
      p_tenant_id => v_sale.tenant_id,
      p_variant_id => v_item.variant_id,
      p_type => 'RETURN',
      p_quantity => v_item.quantity,
      p_origin => 'SALE',
      p_reference_type => 'sale',
      p_reference_id => p_sale_id,
      p_audit_action => 'sale.item_returned'
    );
  end loop;

  update public.sales set canceled_at = now(), canceled_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_sale_id;

  if v_sale.customer_id is not null then
    perform private.log_timeline_event(v_sale.tenant_id, v_sale.customer_id, 'sale.canceled',
      jsonb_build_object('sale_id', p_sale_id, 'reason', p_reason));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- customer_stats passa a refletir vendas reais (Fase 3 só devolvia zero/nulo,
-- documentado como provisório até a Fase 4 existir). Vendas canceladas não
-- contam para nenhuma métrica.
-- -----------------------------------------------------------------------------

create or replace view public.customer_stats
with (security_invoker = true)
as
select
  c.id as customer_id,
  c.tenant_id,
  coalesce(s.total_spent, 0) as total_spent,
  coalesce(s.purchase_count, 0) as purchase_count,
  case when coalesce(s.purchase_count, 0) > 0 then s.total_spent / s.purchase_count end as average_ticket,
  s.last_purchase_at
from public.customers c
left join lateral (
  select sum(sale.total) as total_spent, count(*) as purchase_count, max(sale.created_at) as last_purchase_at
  from public.sales sale
  where sale.customer_id = c.id and sale.canceled_at is null
) s on true;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('reservations.read', 'reservations', 'Consultar reservas'),
  ('reservations.write', 'reservations', 'Criar, mover e cancelar reservas'),
  ('sales.read', 'sales', 'Consultar vendas'),
  ('sales.write', 'sales', 'Registrar e cancelar vendas (PDV)'),
  ('sales.discount', 'sales', 'Aplicar desconto em vendas');

insert into public.role_permissions (role_code, permission_code)
select r.code, p.code
from public.roles r
cross join unnest(array['reservations.read', 'reservations.write', 'sales.read', 'sales.write']) as p(code)
where r.code in ('OWNER', 'ADMIN', 'GERENTE', 'VENDEDOR');

insert into public.role_permissions (role_code, permission_code)
select r.code, 'sales.discount'
from public.roles r where r.code in ('OWNER', 'ADMIN', 'GERENTE');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.reservations enable row level security;
alter table public.reservation_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy reservations_select on public.reservations for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('reservations.read')));
create policy reservation_items_select on public.reservation_items for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('reservations.read')));
create policy sales_select on public.sales for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('sales.read')));
create policy sale_items_select on public.sale_items for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('sales.read')));

revoke all on public.reservations, public.reservation_items, public.sales, public.sale_items from anon, authenticated;

grant select on public.reservations, public.reservation_items, public.sales, public.sale_items to authenticated;

grant all on public.reservations, public.reservation_items, public.sales, public.sale_items to service_role;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.reservation_create(uuid, uuid, jsonb, timestamptz, text, text, text),
  public.reservation_advance(uuid, public.reservation_status),
  public.reservation_cancel(uuid, text),
  public.reservation_complete(uuid, text, numeric, numeric, uuid),
  public.reservations_expire_due(uuid),
  public.sale_create(uuid, jsonb, uuid, public.sale_origin, numeric, text, numeric, text, uuid, text),
  public.sale_cancel(uuid, text)
from public, anon;

grant execute on function
  public.reservation_create(uuid, uuid, jsonb, timestamptz, text, text, text),
  public.reservation_advance(uuid, public.reservation_status),
  public.reservation_cancel(uuid, text),
  public.reservation_complete(uuid, text, numeric, numeric, uuid),
  public.reservations_expire_due(uuid),
  public.sale_create(uuid, jsonb, uuid, public.sale_origin, numeric, text, numeric, text, uuid, text),
  public.sale_cancel(uuid, text)
to authenticated, service_role;
