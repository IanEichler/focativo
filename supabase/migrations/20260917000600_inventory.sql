-- =============================================================================
-- FASE 2 · Estoque, lotes e movimentações
--
-- Invariantes garantidos pelo banco:
--   * physical_quantity >= 0, reserved_quantity >= 0, reserved <= physical
--   * available_quantity = physical - reserved (coluna gerada: nunca diverge)
--   * produtos com lote: soma(lotes.quantity) = physical_quantity
--   * nenhuma alteração silenciosa: estoque só muda por private.apply_stock_movement,
--     que grava o ledger append-only (stock_movements) na mesma transação
--   * concorrência: lock da linha de estoque da variante serializa as operações
--   * idempotência: (tenant_id, idempotency_key) único; repetição devolve o
--     movimento original sem reaplicar
-- =============================================================================

create type public.stock_movement_type as enum
  ('ENTRY', 'SALE', 'RESERVATION', 'RESERVATION_RELEASE', 'ADJUSTMENT', 'LOSS', 'RETURN');

create type public.stock_movement_origin as enum
  ('MANUAL', 'RESERVATION', 'ORDER', 'SALE', 'IMPORT', 'SYSTEM');

-- -----------------------------------------------------------------------------
-- Nível de estoque por variante
-- -----------------------------------------------------------------------------

create table public.stock_levels (
  variant_id uuid primary key,
  tenant_id uuid not null,
  product_id uuid not null,
  physical_quantity numeric(14, 3) not null default 0 check (physical_quantity >= 0),
  reserved_quantity numeric(14, 3) not null default 0 check (reserved_quantity >= 0),
  available_quantity numeric(14, 3) generated always as (physical_quantity - reserved_quantity) stored,
  updated_at timestamptz not null default now(),
  constraint stock_levels_reserved_within_physical check (reserved_quantity <= physical_quantity),
  constraint stock_levels_variant_fkey foreign key (tenant_id, product_id, variant_id)
    references public.product_variants (tenant_id, product_id, id) on delete cascade
);

create index stock_levels_tenant_product_idx on public.stock_levels (tenant_id, product_id);
create index stock_levels_tenant_available_idx on public.stock_levels (tenant_id, available_quantity);

create or replace function private.create_stock_level_for_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (variant_id, tenant_id, product_id)
  values (new.id, new.tenant_id, new.product_id)
  on conflict (variant_id) do nothing;
  return new;
end;
$$;

create trigger product_variants_create_stock_level
  after insert on public.product_variants
  for each row execute function private.create_stock_level_for_variant();

-- -----------------------------------------------------------------------------
-- Lotes
-- -----------------------------------------------------------------------------

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  lot_code text not null check (char_length(btrim(lot_code)) between 1 and 64),
  manufactured_on date,
  expires_on date,
  supplier_id uuid,
  quantity numeric(14, 3) not null default 0 check (quantity >= 0),
  received_quantity numeric(14, 3) not null default 0 check (received_quantity >= 0),
  notes text check (notes is null or char_length(notes) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_lots_tenant_id_id_key unique (tenant_id, id),
  constraint stock_lots_dates check (expires_on is null or manufactured_on is null or expires_on >= manufactured_on),
  constraint stock_lots_variant_fkey foreign key (tenant_id, product_id, variant_id)
    references public.product_variants (tenant_id, product_id, id) on delete restrict,
  constraint stock_lots_supplier_fkey foreign key (tenant_id, supplier_id)
    references public.suppliers (tenant_id, id) on delete set null (supplier_id)
);

create unique index stock_lots_code_unique on public.stock_lots (variant_id, upper(btrim(lot_code)));
create index stock_lots_fefo_idx on public.stock_lots (variant_id, expires_on nulls last, created_at) where quantity > 0;
create index stock_lots_expiry_idx on public.stock_lots (tenant_id, expires_on) where quantity > 0 and expires_on is not null;

create trigger stock_lots_set_updated_at
  before update on public.stock_lots
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Ledger de movimentações (append-only)
-- -----------------------------------------------------------------------------

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  type public.stock_movement_type not null,
  origin public.stock_movement_origin not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  physical_delta numeric(14, 3) not null,
  reserved_delta numeric(14, 3) not null,
  physical_after numeric(14, 3) not null check (physical_after >= 0),
  reserved_after numeric(14, 3) not null check (reserved_after >= 0),
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  reason text check (reason is null or char_length(reason) <= 500),
  reference_type text check (reference_type is null or reference_type ~ '^[a-z][a-z_]{1,39}$'),
  reference_id uuid,
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  actor_user_id uuid,
  actor_type public.audit_actor_type not null default 'USER',
  request_id text check (request_id is null or char_length(request_id) <= 64),
  created_at timestamptz not null default now(),
  constraint stock_movements_tenant_id_id_key unique (tenant_id, id),
  constraint stock_movements_variant_fkey foreign key (tenant_id, product_id, variant_id)
    references public.product_variants (tenant_id, product_id, id) on delete restrict,
  constraint stock_movements_product_fkey foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict,
  constraint stock_movements_reason_required check (type not in ('ADJUSTMENT', 'LOSS') or reason is not null),
  constraint stock_movements_delta_rules check (
    case type
      when 'ENTRY' then physical_delta = quantity and reserved_delta = 0
      when 'RETURN' then physical_delta = quantity and reserved_delta = 0
      when 'LOSS' then physical_delta = -quantity and reserved_delta = 0
      when 'ADJUSTMENT' then abs(physical_delta) = quantity and reserved_delta = 0
      when 'RESERVATION' then physical_delta = 0 and reserved_delta = quantity
      when 'RESERVATION_RELEASE' then physical_delta = 0 and reserved_delta = -quantity
      when 'SALE' then physical_delta = -quantity and reserved_delta in (0, -quantity)
    end
  )
);

create unique index stock_movements_idempotency_key
  on public.stock_movements (tenant_id, idempotency_key) where idempotency_key is not null;
create index stock_movements_variant_created_idx on public.stock_movements (tenant_id, variant_id, created_at desc);
create index stock_movements_tenant_created_idx on public.stock_movements (tenant_id, created_at desc);
create index stock_movements_reference_idx on public.stock_movements (tenant_id, reference_type, reference_id)
  where reference_id is not null;

create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function private.prevent_mutation();

create table public.stock_movement_lots (
  movement_id uuid not null,
  lot_id uuid not null,
  tenant_id uuid not null,
  quantity_delta numeric(14, 3) not null check (quantity_delta <> 0),
  lot_quantity_after numeric(14, 3) not null check (lot_quantity_after >= 0),
  primary key (movement_id, lot_id),
  constraint stock_movement_lots_movement_fkey foreign key (tenant_id, movement_id)
    references public.stock_movements (tenant_id, id) on delete restrict,
  constraint stock_movement_lots_lot_fkey foreign key (tenant_id, lot_id)
    references public.stock_lots (tenant_id, id) on delete restrict
);

create index stock_movement_lots_lot_idx on public.stock_movement_lots (lot_id);

create trigger stock_movement_lots_append_only
  before update or delete on public.stock_movement_lots
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Primitiva única de movimentação
-- -----------------------------------------------------------------------------

create or replace function private.apply_stock_movement(
  p_tenant_id uuid,
  p_variant_id uuid,
  p_type public.stock_movement_type,
  p_quantity numeric,
  p_origin public.stock_movement_origin,
  p_reason text default null,
  p_lot_id uuid default null,
  -- entrada/ajuste positivo em lote novo ou existente pelo código:
  -- { lot_code, manufactured_on, expires_on, supplier_id, notes }
  p_new_lot jsonb default null,
  p_adjust_direction smallint default null,
  p_consume_reserved boolean default false,
  p_skip_expired boolean default false,
  p_unit_cost numeric default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_idempotency_key text default null,
  p_actor_type public.audit_actor_type default null,
  p_audit_action text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.stock_movements;
  v_level public.stock_levels;
  v_product public.products;
  v_variant public.product_variants;
  v_lot public.stock_lots;
  v_physical_delta numeric;
  v_reserved_delta numeric;
  v_new_physical numeric;
  v_new_reserved numeric;
  v_movement_id uuid := gen_random_uuid();
  v_remaining numeric;
  v_take numeric;
  v_lot_code text;
  v_actor_type public.audit_actor_type := coalesce(
    p_actor_type,
    case when (select auth.uid()) is null then 'SYSTEM' else 'USER' end::public.audit_actor_type
  );
  v_reason text := nullif(btrim(p_reason), '');
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 3) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
      if v_existing.variant_id <> p_variant_id or v_existing.type <> p_type or v_existing.quantity <> p_quantity then
        raise exception 'idempotency_conflict' using errcode = '23505';
      end if;
      return v_existing.id;
    end if;
  end if;

  -- Lock: serializa todas as movimentações da variante.
  select * into v_level from public.stock_levels
  where variant_id = p_variant_id and tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Revalida idempotência após o lock (requisição concorrente com a mesma chave).
  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
      if v_existing.variant_id <> p_variant_id or v_existing.type <> p_type or v_existing.quantity <> p_quantity then
        raise exception 'idempotency_conflict' using errcode = '23505';
      end if;
      return v_existing.id;
    end if;
  end if;

  select * into v_variant from public.product_variants where id = p_variant_id;
  select * into v_product from public.products where id = v_level.product_id;

  case p_type
    when 'ENTRY', 'RETURN' then
      v_physical_delta := p_quantity; v_reserved_delta := 0;
    when 'LOSS' then
      v_physical_delta := -p_quantity; v_reserved_delta := 0;
    when 'ADJUSTMENT' then
      if p_adjust_direction is null or p_adjust_direction not in (1, -1) then
        raise exception 'invalid_input' using errcode = '22023', detail = 'adjust_direction';
      end if;
      v_physical_delta := p_quantity * p_adjust_direction; v_reserved_delta := 0;
    when 'RESERVATION' then
      v_physical_delta := 0; v_reserved_delta := p_quantity;
    when 'RESERVATION_RELEASE' then
      v_physical_delta := 0; v_reserved_delta := -p_quantity;
    when 'SALE' then
      v_physical_delta := -p_quantity;
      v_reserved_delta := case when p_consume_reserved then -p_quantity else 0 end;
  end case;

  -- Entradas e novas reservas não são aceitas para itens arquivados.
  if (v_physical_delta > 0 or v_reserved_delta > 0)
     and (v_product.archived_at is not null or v_variant.archived_at is not null) then
    raise exception 'product_archived' using errcode = 'P0001';
  end if;

  v_new_physical := v_level.physical_quantity + v_physical_delta;
  v_new_reserved := v_level.reserved_quantity + v_reserved_delta;

  if v_new_physical < 0 or v_new_reserved < 0 or v_new_reserved > v_new_physical then
    raise exception 'insufficient_stock' using errcode = 'P0001',
      detail = format('available=%s requested=%s', v_level.available_quantity, p_quantity);
  end if;

  if not v_product.track_lots and (p_lot_id is not null or p_new_lot is not null) then
    raise exception 'lots_not_tracked' using errcode = 'P0001';
  end if;

  insert into public.stock_movements (
    id, tenant_id, product_id, variant_id, type, origin, quantity, physical_delta, reserved_delta,
    physical_after, reserved_after, unit_cost, reason, reference_type, reference_id, idempotency_key,
    actor_user_id, actor_type, request_id
  ) values (
    v_movement_id, p_tenant_id, v_level.product_id, p_variant_id, p_type, p_origin, p_quantity,
    v_physical_delta, v_reserved_delta, v_new_physical, v_new_reserved, p_unit_cost, v_reason,
    p_reference_type, p_reference_id, p_idempotency_key, (select auth.uid()), v_actor_type,
    private.current_request_id()
  );

  if v_product.track_lots and v_physical_delta > 0 then
    if p_lot_id is not null then
      select * into v_lot from public.stock_lots where id = p_lot_id and variant_id = p_variant_id for update;
      if not found then
        raise exception 'not_found' using errcode = 'P0002', detail = 'lot';
      end if;
    elsif p_new_lot is not null and nullif(btrim(p_new_lot ->> 'lot_code'), '') is not null then
      v_lot_code := btrim(p_new_lot ->> 'lot_code');
      select * into v_lot from public.stock_lots
      where variant_id = p_variant_id and upper(btrim(lot_code)) = upper(v_lot_code)
      for update;

      if found then
        if (p_new_lot ->> 'expires_on') is not null
           and v_lot.expires_on is distinct from (p_new_lot ->> 'expires_on')::date then
          raise exception 'lot_mismatch' using errcode = 'P0001';
        end if;
      else
        begin
          insert into public.stock_lots (
            tenant_id, product_id, variant_id, lot_code, manufactured_on, expires_on, supplier_id, notes, created_by
          ) values (
            p_tenant_id, v_level.product_id, p_variant_id, v_lot_code,
            (p_new_lot ->> 'manufactured_on')::date,
            (p_new_lot ->> 'expires_on')::date,
            (p_new_lot ->> 'supplier_id')::uuid,
            nullif(btrim(p_new_lot ->> 'notes'), ''),
            (select auth.uid())
          )
          returning * into v_lot;
        exception
          when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
            or check_violation or foreign_key_violation then
            raise exception 'invalid_input' using errcode = '22023', detail = 'lot';
        end;
      end if;
    else
      raise exception 'lot_required' using errcode = 'P0001';
    end if;

    update public.stock_lots set
      quantity = quantity + v_physical_delta,
      received_quantity = received_quantity + case when p_type = 'ENTRY' then v_physical_delta else 0 end
    where id = v_lot.id
    returning * into v_lot;

    insert into public.stock_movement_lots (movement_id, lot_id, tenant_id, quantity_delta, lot_quantity_after)
    values (v_movement_id, v_lot.id, p_tenant_id, v_physical_delta, v_lot.quantity);

  elsif v_product.track_lots and v_physical_delta < 0 then
    if p_lot_id is not null then
      select * into v_lot from public.stock_lots where id = p_lot_id and variant_id = p_variant_id for update;
      if not found then
        raise exception 'not_found' using errcode = 'P0002', detail = 'lot';
      end if;
      if v_lot.quantity < -v_physical_delta then
        raise exception 'insufficient_lot_stock' using errcode = 'P0001';
      end if;
      update public.stock_lots set quantity = quantity + v_physical_delta where id = v_lot.id returning * into v_lot;
      insert into public.stock_movement_lots (movement_id, lot_id, tenant_id, quantity_delta, lot_quantity_after)
      values (v_movement_id, v_lot.id, p_tenant_id, v_physical_delta, v_lot.quantity);
    else
      -- FEFO: vence primeiro, sai primeiro. Vendas ignoram lotes vencidos.
      v_remaining := -v_physical_delta;
      for v_lot in
        select * from public.stock_lots
        where variant_id = p_variant_id
          and quantity > 0
          and (not p_skip_expired or expires_on is null or expires_on >= current_date)
        order by expires_on asc nulls last, created_at asc
        for update
      loop
        exit when v_remaining <= 0;
        v_take := least(v_remaining, v_lot.quantity);
        update public.stock_lots set quantity = quantity - v_take where id = v_lot.id returning * into v_lot;
        insert into public.stock_movement_lots (movement_id, lot_id, tenant_id, quantity_delta, lot_quantity_after)
        values (v_movement_id, v_lot.id, p_tenant_id, -v_take, v_lot.quantity);
        v_remaining := v_remaining - v_take;
      end loop;

      if v_remaining > 0 then
        raise exception 'insufficient_stock' using errcode = 'P0001', detail = 'lots';
      end if;
    end if;
  end if;

  update public.stock_levels set
    physical_quantity = v_new_physical,
    reserved_quantity = v_new_reserved,
    updated_at = now()
  where variant_id = p_variant_id;

  if v_product.track_lots and (
    select coalesce(sum(quantity), 0) from public.stock_lots where variant_id = p_variant_id
  ) <> v_new_physical then
    raise exception 'stock_integrity_error' using errcode = 'XX000';
  end if;

  if p_audit_action is not null then
    perform private.log_audit(
      p_tenant_id, p_audit_action, 'stock_movement', v_movement_id::text,
      jsonb_build_object('physical', v_level.physical_quantity, 'reserved', v_level.reserved_quantity),
      jsonb_build_object('physical', v_new_physical, 'reserved', v_new_reserved),
      jsonb_build_object('variant_id', p_variant_id, 'type', p_type, 'quantity', p_quantity, 'reason', v_reason),
      v_actor_type
    );
  end if;

  return v_movement_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs públicas (operações manuais)
-- -----------------------------------------------------------------------------

create or replace function private.variant_tenant_for_permission(p_variant_id uuid, p_permission text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  perform private.require_user();
  select tenant_id into v_tenant_id from public.product_variants where id = p_variant_id;
  if v_tenant_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_tenant_id, p_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_tenant_id;
end;
$$;

create or replace function public.inventory_register_entry(
  p_variant_id uuid,
  p_quantity numeric,
  p_idempotency_key text,
  p_reason text default null,
  p_unit_cost numeric default null,
  p_lot_id uuid default null,
  p_lot_code text default null,
  p_manufactured_on date default null,
  p_expires_on date default null,
  p_supplier_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.variant_tenant_for_permission(p_variant_id, 'inventory.entry');
begin
  if p_unit_cost is not null and not private.has_tenant_permission(v_tenant_id, 'catalog.costs') then
    raise exception 'forbidden' using errcode = '42501', detail = 'catalog.costs';
  end if;
  if p_expires_on is not null and p_expires_on < current_date then
    raise exception 'lot_expired' using errcode = 'P0001';
  end if;

  return private.apply_stock_movement(
    p_tenant_id => v_tenant_id,
    p_variant_id => p_variant_id,
    p_type => 'ENTRY',
    p_quantity => p_quantity,
    p_origin => 'MANUAL',
    p_reason => p_reason,
    p_lot_id => p_lot_id,
    p_new_lot => case when p_lot_code is not null then jsonb_build_object(
      'lot_code', p_lot_code, 'manufactured_on', p_manufactured_on, 'expires_on', p_expires_on,
      'supplier_id', p_supplier_id) end,
    p_unit_cost => p_unit_cost,
    p_idempotency_key => p_idempotency_key,
    p_audit_action => 'inventory.entry'
  );
end;
$$;

create or replace function public.inventory_register_loss(
  p_variant_id uuid,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text,
  p_lot_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.variant_tenant_for_permission(p_variant_id, 'inventory.adjust');
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;

  return private.apply_stock_movement(
    p_tenant_id => v_tenant_id,
    p_variant_id => p_variant_id,
    p_type => 'LOSS',
    p_quantity => p_quantity,
    p_origin => 'MANUAL',
    p_reason => p_reason,
    p_lot_id => p_lot_id,
    p_idempotency_key => p_idempotency_key,
    p_audit_action => 'inventory.loss'
  );
end;
$$;

-- Ajuste por contagem: informa a quantidade contada (da variante ou do lote).
create or replace function public.inventory_adjust_stock(
  p_variant_id uuid,
  p_counted_quantity numeric,
  p_reason text,
  p_idempotency_key text,
  p_lot_id uuid default null,
  p_lot_code text default null,
  p_expires_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.variant_tenant_for_permission(p_variant_id, 'inventory.adjust');
  v_level public.stock_levels;
  v_track_lots boolean;
  v_current numeric;
  v_delta numeric;
  v_existing uuid;
  v_lot_id uuid := p_lot_id;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if p_counted_quantity is null or p_counted_quantity < 0 or p_counted_quantity <> round(p_counted_quantity, 3) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  -- Repetição idempotente devolve o ajuste original antes de recalcular a diferença.
  select id into v_existing from public.stock_movements
  where tenant_id = v_tenant_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_level from public.stock_levels where variant_id = p_variant_id for update;
  select p.track_lots into v_track_lots from public.products p where p.id = v_level.product_id;

  if v_track_lots then
    if p_lot_id is not null then
      select quantity into v_current from public.stock_lots where id = p_lot_id and variant_id = p_variant_id for update;
      if v_current is null then
        raise exception 'not_found' using errcode = 'P0002', detail = 'lot';
      end if;
    elsif p_lot_code is not null then
      select id, quantity into v_lot_id, v_current from public.stock_lots
      where variant_id = p_variant_id and upper(btrim(lot_code)) = upper(btrim(p_lot_code)) for update;
      v_current := coalesce(v_current, 0);
    else
      raise exception 'lot_required' using errcode = 'P0001';
    end if;
  else
    if p_lot_id is not null or p_lot_code is not null then
      raise exception 'lots_not_tracked' using errcode = 'P0001';
    end if;
    v_current := v_level.physical_quantity;
  end if;

  v_delta := p_counted_quantity - v_current;
  if v_delta = 0 then
    raise exception 'no_change' using errcode = 'P0001';
  end if;
  if v_level.physical_quantity + v_delta < v_level.reserved_quantity then
    raise exception 'below_reserved' using errcode = 'P0001';
  end if;

  return private.apply_stock_movement(
    p_tenant_id => v_tenant_id,
    p_variant_id => p_variant_id,
    p_type => 'ADJUSTMENT',
    p_quantity => abs(v_delta),
    p_origin => 'MANUAL',
    p_reason => p_reason,
    p_lot_id => v_lot_id,
    p_new_lot => case when v_lot_id is null and p_lot_code is not null
                   then jsonb_build_object('lot_code', p_lot_code, 'expires_on', p_expires_on) end,
    p_adjust_direction => sign(v_delta)::smallint,
    p_idempotency_key => p_idempotency_key,
    p_audit_action => 'inventory.adjustment'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Consultas (security_invoker: o RLS das tabelas base se aplica)
-- -----------------------------------------------------------------------------

create or replace function private.tenant_expiry_alert_days(p_tenant_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(1, least(365, coalesce((t.settings ->> 'expiry_alert_days')::int, 30)))
  from public.tenants t where t.id = p_tenant_id;
$$;

create view public.inventory_variant_overview
with (security_invoker = true)
as
select
  v.id as variant_id,
  v.tenant_id,
  p.id as product_id,
  p.name as product_name,
  v.name as variant_name,
  p.has_variants,
  v.sku,
  v.barcode,
  coalesce(v.image_path, p.image_path) as image_path,
  p.category_id,
  c.name as category_name,
  b.name as brand_name,
  p.unit,
  (p.is_active and v.is_active) as is_active,
  p.track_lots,
  s.physical_quantity,
  s.reserved_quantity,
  s.available_quantity,
  coalesce(v.min_stock, p.min_stock) as min_stock,
  case
    when s.available_quantity <= 0 then 'OUT'
    when coalesce(v.min_stock, p.min_stock) > 0 and s.available_quantity <= coalesce(v.min_stock, p.min_stock) then 'LOW'
    else 'OK'
  end as stock_status,
  lots.next_expiration,
  coalesce(lots.expired_quantity, 0) as expired_quantity,
  coalesce(lots.expiring_quantity, 0) as expiring_quantity,
  s.updated_at as stock_updated_at,
  private.search_normalize(concat_ws(' ', p.name, v.name, v.sku, v.barcode, b.name)) as search_text
from public.product_variants v
join public.products p on p.id = v.product_id
join public.stock_levels s on s.variant_id = v.id
left join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
left join lateral (
  select
    min(l.expires_on) filter (where l.expires_on >= current_date) as next_expiration,
    sum(l.quantity) filter (where l.expires_on < current_date) as expired_quantity,
    sum(l.quantity) filter (
      where l.expires_on >= current_date
        and l.expires_on <= current_date + private.tenant_expiry_alert_days(v.tenant_id)
    ) as expiring_quantity
  from public.stock_lots l
  where l.variant_id = v.id and l.quantity > 0
) lots on true
where v.archived_at is null and p.archived_at is null;

create view public.inventory_lot_overview
with (security_invoker = true)
as
select
  l.id as lot_id,
  l.tenant_id,
  l.product_id,
  l.variant_id,
  p.name as product_name,
  v.name as variant_name,
  p.has_variants,
  v.sku,
  l.lot_code,
  l.manufactured_on,
  l.expires_on,
  l.quantity,
  l.received_quantity,
  sup.name as supplier_name,
  case
    when l.expires_on is null then 'NO_EXPIRY'
    when l.expires_on < current_date then 'EXPIRED'
    when l.expires_on <= current_date + private.tenant_expiry_alert_days(l.tenant_id) then 'EXPIRING'
    else 'OK'
  end as expiry_status,
  (l.expires_on - current_date) as days_to_expiry,
  l.created_at
from public.stock_lots l
join public.product_variants v on v.id = l.variant_id
join public.products p on p.id = l.product_id
left join public.suppliers sup on sup.id = l.supplier_id;

create or replace function public.inventory_summary(p_tenant_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'active_variants', count(*) filter (where o.is_active),
    'low_stock', count(*) filter (where o.is_active and o.stock_status = 'LOW'),
    'out_of_stock', count(*) filter (where o.is_active and o.stock_status = 'OUT'),
    'expiring_lots', (
      select count(*) from public.inventory_lot_overview l
      where l.tenant_id = p_tenant_id and l.quantity > 0 and l.expiry_status = 'EXPIRING'
    ),
    'expired_lots', (
      select count(*) from public.inventory_lot_overview l
      where l.tenant_id = p_tenant_id and l.quantity > 0 and l.expiry_status = 'EXPIRED'
    ),
    'expiry_alert_days', private.tenant_expiry_alert_days(p_tenant_id)
  )
  from public.inventory_variant_overview o
  where o.tenant_id = p_tenant_id;
$$;

-- -----------------------------------------------------------------------------
-- RLS e privilégios
-- -----------------------------------------------------------------------------

alter table public.stock_levels enable row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movement_lots enable row level security;

create policy stock_levels_select on public.stock_levels
  for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('inventory.read')));

create policy stock_lots_select on public.stock_lots
  for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('inventory.read')));

create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('inventory.history')));

create policy stock_movement_lots_select on public.stock_movement_lots
  for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('inventory.history')));

revoke all on
  public.stock_levels, public.stock_lots, public.stock_movements, public.stock_movement_lots,
  public.inventory_variant_overview, public.inventory_lot_overview
from anon, authenticated;

grant select on
  public.stock_levels, public.stock_lots, public.stock_movements, public.stock_movement_lots,
  public.inventory_variant_overview, public.inventory_lot_overview
to authenticated;

grant all on public.stock_levels, public.stock_lots, public.stock_movements, public.stock_movement_lots to service_role;
grant select on public.inventory_variant_overview, public.inventory_lot_overview to service_role;

revoke all on all functions in schema private from public, anon;
grant execute on function private.tenant_expiry_alert_days(uuid) to authenticated;

revoke execute on function
  public.inventory_register_entry(uuid, numeric, text, text, numeric, uuid, text, date, date, uuid),
  public.inventory_register_loss(uuid, numeric, text, text, uuid),
  public.inventory_adjust_stock(uuid, numeric, text, text, uuid, text, date),
  public.inventory_summary(uuid)
from public, anon;

grant execute on function
  public.inventory_register_entry(uuid, numeric, text, text, numeric, uuid, text, date, date, uuid),
  public.inventory_register_loss(uuid, numeric, text, text, uuid),
  public.inventory_adjust_stock(uuid, numeric, text, text, uuid, text, date),
  public.inventory_summary(uuid)
to authenticated, service_role;
