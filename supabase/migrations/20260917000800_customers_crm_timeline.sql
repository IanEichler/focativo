-- =============================================================================
-- FASE 3 · Clientes, CRM (Kanban configurável) e Timeline
--
-- Clientes usam escrita direta (cadastro simples, como categorias/marcas).
-- Oportunidades de CRM usam RPCs: a transição de etapa precisa registrar
-- timestamps de ganho/perda e emitir timeline de forma atômica.
-- Timeline é um ledger append-only (mesmo padrão de audit_logs): a única
-- forma de escrever é private.log_timeline_event(), nunca INSERT direto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  phone text check (phone is null or phone ~ '^[0-9]{10,15}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
  email text check (email is null or char_length(email) <= 320),
  document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  birthday date,
  notes text check (notes is null or char_length(notes) <= 2000),
  tags text[] not null default '{}',
  origin text check (origin is null or origin ~ '^[a-z][a-z_]{1,29}$'),
  responsible_user_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_tenant_id_id_key unique (tenant_id, id),
  constraint customers_needs_contact check (phone is not null or whatsapp is not null or email is not null)
);

-- WhatsApp é a chave de identidade usada pelo serviço de mensageria (Fase 6)
-- para reconhecer quem está escrevendo: precisa ser único por empresa.
create unique index customers_tenant_whatsapp_unique
  on public.customers (tenant_id, whatsapp) where whatsapp is not null and archived_at is null;
create index customers_tenant_name_idx on public.customers (tenant_id, lower(btrim(name)));
create index customers_tenant_responsible_idx on public.customers (tenant_id, responsible_user_id);
create index customers_tenant_archived_idx on public.customers (tenant_id, archived_at);
create index customers_tags_idx on public.customers using gin (tags);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

create trigger customers_audit_update
  after update on public.customers
  for each row execute function private.audit_row_update('customer', 'tenant_id');

-- -----------------------------------------------------------------------------
-- Estatísticas calculadas do cliente
--
-- Total gasto, nº de compras, ticket médio e última compra dependem de vendas
-- (Fase 4). Até lá a view existe com a forma final, mas retorna zero/nulo —
-- nunca inventa números. A Fase 4 troca esta view por CREATE OR REPLACE
-- juntando `sales`/`orders`, sem quebrar quem já consome customer_stats.
-- -----------------------------------------------------------------------------

create view public.customer_stats
with (security_invoker = true)
as
select
  c.id as customer_id,
  c.tenant_id,
  0::numeric as total_spent,
  0::bigint as purchase_count,
  null::numeric as average_ticket,
  null::timestamptz as last_purchase_at
from public.customers c;

revoke all on public.customer_stats from anon, authenticated;
grant select on public.customer_stats to authenticated;
grant all on public.customer_stats to service_role;

-- -----------------------------------------------------------------------------
-- CRM · Etapas do funil (configuráveis por tenant)
-- -----------------------------------------------------------------------------

create table public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default 'neutral' check (color ~ '^[a-z][a-z-]{1,29}$'),
  sort_order integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_stages_tenant_id_id_key unique (tenant_id, id),
  constraint crm_stages_code_key unique (tenant_id, code),
  constraint crm_stages_not_won_and_lost check (not (is_won and is_lost))
);

create index crm_stages_tenant_sort_idx on public.crm_stages (tenant_id, sort_order);

create trigger crm_stages_set_updated_at
  before update on public.crm_stages
  for each row execute function private.set_updated_at();

create or replace function private.install_default_crm_stages(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.crm_stages (tenant_id, code, name, color, sort_order, is_won, is_lost) values
    (p_tenant_id, 'novo', 'Novo', 'info', 10, false, false),
    (p_tenant_id, 'em_atendimento', 'Em atendimento', 'info', 20, false, false),
    (p_tenant_id, 'interessado', 'Interessado', 'brand', 30, false, false),
    (p_tenant_id, 'reservado', 'Reservado', 'warning', 40, false, false),
    (p_tenant_id, 'aguardando_pagamento', 'Aguardando pagamento', 'warning', 50, false, false),
    (p_tenant_id, 'vendido', 'Vendido', 'success', 60, true, false),
    (p_tenant_id, 'perdido', 'Perdido', 'danger', 70, false, true)
  on conflict (tenant_id, code) do nothing;
$$;

create or replace function private.tenants_after_insert_install_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_default_crm_stages(new.id);
  return new;
end;
$$;

create trigger tenants_install_crm_stages
  after insert on public.tenants
  for each row execute function private.tenants_after_insert_install_crm();

-- Backfill para tenants criados antes desta migration.
select private.install_default_crm_stages(id) from public.tenants;

-- -----------------------------------------------------------------------------
-- Timeline · ledger append-only (mesmo padrão de audit_logs)
-- -----------------------------------------------------------------------------

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  type text not null check (type ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  actor_user_id uuid,
  actor_type public.audit_actor_type not null default 'USER',
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  constraint timeline_events_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade
);

create index timeline_events_customer_idx on public.timeline_events (customer_id, occurred_at desc);
create index timeline_events_tenant_idx on public.timeline_events (tenant_id, occurred_at desc);

create trigger timeline_events_append_only
  before update or delete on public.timeline_events
  for each row execute function private.prevent_mutation();

create or replace function private.log_timeline_event(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb,
  p_actor_type public.audit_actor_type default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.timeline_events (tenant_id, customer_id, type, actor_user_id, actor_type, payload)
  values (
    p_tenant_id, p_customer_id, p_type, (select auth.uid()),
    coalesce(p_actor_type, case when (select auth.uid()) is null then 'SYSTEM' else 'USER' end::public.audit_actor_type),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id;
$$;

-- Cliente criado: primeiro evento da timeline.
create or replace function private.customers_after_insert_timeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_timeline_event(new.tenant_id, new.id, 'customer.created', jsonb_build_object('name', new.name));
  return new;
end;
$$;

create trigger customers_insert_timeline
  after insert on public.customers
  for each row execute function private.customers_after_insert_timeline();

-- -----------------------------------------------------------------------------
-- CRM · Oportunidades (RPC-only: transição de etapa precisa ser atômica com a
-- timeline e com os timestamps de ganho/perda)
-- -----------------------------------------------------------------------------

create table public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  stage_id uuid not null,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  origin text check (origin is null or origin ~ '^[a-z][a-z_]{1,29}$'),
  title text check (title is null or char_length(title) <= 160),
  estimated_value numeric(12, 2) check (estimated_value is null or estimated_value >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  expected_at date,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text check (lost_reason is null or char_length(lost_reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_opportunities_tenant_id_id_key unique (tenant_id, id),
  constraint crm_opportunities_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint crm_opportunities_stage_fkey foreign key (tenant_id, stage_id)
    references public.crm_stages (tenant_id, id) on delete restrict
);

create index crm_opportunities_tenant_stage_idx on public.crm_opportunities (tenant_id, stage_id);
create index crm_opportunities_customer_idx on public.crm_opportunities (customer_id);
create index crm_opportunities_responsible_idx on public.crm_opportunities (tenant_id, responsible_user_id);

create trigger crm_opportunities_set_updated_at
  before update on public.crm_opportunities
  for each row execute function private.set_updated_at();

create trigger crm_opportunities_audit_update
  after update on public.crm_opportunities
  for each row execute function private.audit_row_update('crm_opportunity', 'tenant_id');

create table public.crm_opportunity_products (
  opportunity_id uuid not null,
  tenant_id uuid not null,
  variant_id uuid not null,
  quantity numeric(14, 3) not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (opportunity_id, variant_id),
  constraint crm_opportunity_products_opportunity_fkey foreign key (tenant_id, opportunity_id)
    references public.crm_opportunities (tenant_id, id) on delete cascade,
  constraint crm_opportunity_products_variant_fkey foreign key (tenant_id, variant_id)
    references public.product_variants (tenant_id, id) on delete cascade
);

create or replace function private.load_opportunity_for_write(p_opportunity_id uuid, p_permission text default 'crm.write')
returns public.crm_opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity public.crm_opportunities;
begin
  perform private.require_user();
  select * into v_opportunity from public.crm_opportunities where id = p_opportunity_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_opportunity.tenant_id, p_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_opportunity;
end;
$$;

create or replace function public.crm_create_opportunity(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_stage_id uuid default null,
  p_title text default null,
  p_estimated_value numeric default null,
  p_responsible_user_id uuid default null,
  p_origin text default null,
  p_notes text default null,
  p_expected_at date default null,
  p_variant_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_stage_id uuid;
  v_opportunity_id uuid;
  v_customer public.customers;
  v_variant_id uuid;
begin
  if not private.has_tenant_permission(p_tenant_id, 'crm.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_customer from public.customers where id = p_customer_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_stage_id is not null then
    select id into v_stage_id from public.crm_stages where id = p_stage_id and tenant_id = p_tenant_id and is_active;
    if not found then
      raise exception 'invalid_input' using errcode = '22023', detail = 'stage_id';
    end if;
  else
    select id into v_stage_id from public.crm_stages
    where tenant_id = p_tenant_id and is_active and not is_won and not is_lost
    order by sort_order asc limit 1;
    if v_stage_id is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'stage_id';
    end if;
  end if;

  begin
    insert into public.crm_opportunities (
      tenant_id, customer_id, stage_id, title, estimated_value, responsible_user_id,
      origin, notes, expected_at, created_by
    ) values (
      p_tenant_id, p_customer_id, v_stage_id, nullif(btrim(coalesce(p_title, '')), ''), p_estimated_value,
      p_responsible_user_id, p_origin, nullif(btrim(coalesce(p_notes, '')), ''), p_expected_at, v_uid
    )
    returning id into v_opportunity_id;
  exception
    when invalid_text_representation or check_violation or not_null_violation or foreign_key_violation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'opportunity';
  end;

  if p_variant_ids is not null then
    foreach v_variant_id in array p_variant_ids loop
      begin
        insert into public.crm_opportunity_products (opportunity_id, tenant_id, variant_id)
        values (v_opportunity_id, p_tenant_id, v_variant_id);
      exception
        when foreign_key_violation or unique_violation then
          raise exception 'invalid_input' using errcode = '22023', detail = 'variant_id';
      end;
    end loop;
  end if;

  perform private.log_timeline_event(
    p_tenant_id, p_customer_id, 'crm.opportunity_created',
    jsonb_build_object('opportunity_id', v_opportunity_id, 'title', p_title, 'stage_id', v_stage_id)
  );
  perform private.log_audit(p_tenant_id, 'crm_opportunity.created', 'crm_opportunity', v_opportunity_id::text, null,
    jsonb_build_object('customer_id', p_customer_id, 'stage_id', v_stage_id));

  return v_opportunity_id;
end;
$$;

create or replace function public.crm_update_opportunity(
  p_opportunity_id uuid,
  p_title text default null,
  p_estimated_value numeric default null,
  p_responsible_user_id uuid default null,
  p_origin text default null,
  p_notes text default null,
  p_expected_at date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity public.crm_opportunities;
begin
  v_opportunity := private.load_opportunity_for_write(p_opportunity_id);

  begin
    update public.crm_opportunities set
      title = nullif(btrim(coalesce(p_title, '')), ''),
      estimated_value = p_estimated_value,
      responsible_user_id = p_responsible_user_id,
      origin = p_origin,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      expected_at = p_expected_at
    where id = p_opportunity_id;
  exception
    when invalid_text_representation or check_violation or foreign_key_violation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'opportunity';
  end;
end;
$$;

-- p_lost_reason só é aplicado quando a etapa de destino é is_lost.
create or replace function public.crm_move_opportunity(
  p_opportunity_id uuid,
  p_stage_id uuid,
  p_lost_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity public.crm_opportunities;
  v_stage public.crm_stages;
  v_from_stage_id uuid;
begin
  v_opportunity := private.load_opportunity_for_write(p_opportunity_id);
  v_from_stage_id := v_opportunity.stage_id;

  select * into v_stage from public.crm_stages
  where id = p_stage_id and tenant_id = v_opportunity.tenant_id and is_active;
  if not found then
    raise exception 'invalid_input' using errcode = '22023', detail = 'stage_id';
  end if;

  if v_stage.id = v_from_stage_id then
    return;
  end if;

  update public.crm_opportunities set
    stage_id = v_stage.id,
    won_at = case when v_stage.is_won then now() else null end,
    lost_at = case when v_stage.is_lost then now() else null end,
    lost_reason = case when v_stage.is_lost then nullif(btrim(coalesce(p_lost_reason, '')), '') else null end
  where id = p_opportunity_id;

  perform private.log_timeline_event(
    v_opportunity.tenant_id, v_opportunity.customer_id,
    case when v_stage.is_won then 'crm.opportunity_won'
         when v_stage.is_lost then 'crm.opportunity_lost'
         else 'crm.opportunity_stage_changed' end,
    jsonb_build_object(
      'opportunity_id', p_opportunity_id, 'from_stage_id', v_from_stage_id, 'to_stage_id', v_stage.id,
      'to_stage_name', v_stage.name, 'lost_reason', p_lost_reason
    )
  );
  perform private.log_audit(v_opportunity.tenant_id, 'crm_opportunity.stage_changed', 'crm_opportunity',
    p_opportunity_id::text, jsonb_build_object('stage_id', v_from_stage_id), jsonb_build_object('stage_id', v_stage.id));
end;
$$;

create or replace function public.crm_set_opportunity_products(p_opportunity_id uuid, p_variant_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity public.crm_opportunities;
  v_variant_id uuid;
begin
  v_opportunity := private.load_opportunity_for_write(p_opportunity_id);

  delete from public.crm_opportunity_products where opportunity_id = p_opportunity_id;

  if p_variant_ids is not null then
    foreach v_variant_id in array p_variant_ids loop
      begin
        insert into public.crm_opportunity_products (opportunity_id, tenant_id, variant_id)
        values (p_opportunity_id, v_opportunity.tenant_id, v_variant_id)
        on conflict (opportunity_id, variant_id) do nothing;
      exception
        when foreign_key_violation then
          raise exception 'invalid_input' using errcode = '22023', detail = 'variant_id';
      end;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('customers.read', 'customers', 'Consultar clientes e sua timeline'),
  ('customers.write', 'customers', 'Cadastrar e editar clientes'),
  ('crm.read', 'crm', 'Consultar o funil de oportunidades'),
  ('crm.write', 'crm', 'Criar, mover e editar oportunidades do CRM');

insert into public.role_permissions (role_code, permission_code)
select r.code, p.code
from public.roles r
cross join unnest(array['customers.read', 'customers.write', 'crm.read', 'crm.write']) as p(code)
where r.code in ('OWNER', 'ADMIN', 'GERENTE', 'VENDEDOR');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.crm_stages enable row level security;
alter table public.crm_opportunities enable row level security;
alter table public.crm_opportunity_products enable row level security;
alter table public.timeline_events enable row level security;

create policy customers_select on public.customers for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('customers.read')));
create policy customers_insert on public.customers for insert to authenticated
  with check (tenant_id in (select private.tenant_ids_with_permission('customers.write')));
create policy customers_update on public.customers for update to authenticated
  using (tenant_id in (select private.tenant_ids_with_permission('customers.write')))
  with check (tenant_id in (select private.tenant_ids_with_permission('customers.write')));
create policy customers_delete on public.customers for delete to authenticated
  using (tenant_id in (select private.tenant_ids_with_permission('customers.write')));

create policy crm_stages_select on public.crm_stages for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('crm.read')));
create policy crm_stages_insert on public.crm_stages for insert to authenticated
  with check (tenant_id in (select private.tenant_ids_with_permission('crm.write')));
create policy crm_stages_update on public.crm_stages for update to authenticated
  using (tenant_id in (select private.tenant_ids_with_permission('crm.write')))
  with check (tenant_id in (select private.tenant_ids_with_permission('crm.write')));
create policy crm_stages_delete on public.crm_stages for delete to authenticated
  using (tenant_id in (select private.tenant_ids_with_permission('crm.write')));

create policy crm_opportunities_select on public.crm_opportunities for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('crm.read')));
create policy crm_opportunity_products_select on public.crm_opportunity_products for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('crm.read')));
create policy timeline_events_select on public.timeline_events for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('customers.read')));

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------

revoke all on
  public.customers, public.crm_stages, public.crm_opportunities, public.crm_opportunity_products,
  public.timeline_events
from anon, authenticated;

grant select, insert, delete on public.customers to authenticated;
grant update (name, phone, whatsapp, email, document, birthday, notes, tags, origin, responsible_user_id, archived_at)
  on public.customers to authenticated;

grant select, insert, delete on public.crm_stages to authenticated;
grant update (name, color, sort_order, is_active) on public.crm_stages to authenticated;

grant select on public.crm_opportunities, public.crm_opportunity_products, public.timeline_events to authenticated;

grant all on
  public.customers, public.crm_stages, public.crm_opportunities, public.crm_opportunity_products,
  public.timeline_events
to service_role;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.crm_create_opportunity(uuid, uuid, uuid, text, numeric, uuid, text, text, date, uuid[]),
  public.crm_update_opportunity(uuid, text, numeric, uuid, text, text, date),
  public.crm_move_opportunity(uuid, uuid, text),
  public.crm_set_opportunity_products(uuid, uuid[])
from public, anon;

grant execute on function
  public.crm_create_opportunity(uuid, uuid, uuid, text, numeric, uuid, text, text, date, uuid[]),
  public.crm_update_opportunity(uuid, text, numeric, uuid, text, text, date),
  public.crm_move_opportunity(uuid, uuid, text),
  public.crm_set_opportunity_products(uuid, uuid[])
to authenticated, service_role;
