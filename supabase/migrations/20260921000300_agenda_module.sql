-- =============================================================================
-- Módulo Agenda: segundo "tipo de empresa" (prestadores de serviço — médicos,
-- advogados, salões etc.) ao lado do varejo com estoque já existente.
--
-- tenants.business_type é decidido na criação (autosserviço ou admin master)
-- e determina os módulos DESLIGADOS por padrão em tenant_module_flags:
--   RETAIL   -> desliga 'agenda'
--   SERVICES -> desliga 'catalog', 'inventory', 'reservations', 'sales'
-- Continua ajustável depois pelo admin master (mesmos toggles da Fase 8/9),
-- exatamente como o usuário pediu — a escolha só define o padrão inicial.
--
-- Concorrência: dois agendamentos não podem se sobrepor para o mesmo
-- profissional — não um lock manual como em apply_stock_movement, mas uma
-- exclusion constraint (btree_gist) que o Postgres garante sozinho, sem
-- condição de corrida possível mesmo com duas requisições simultâneas.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

create type public.tenant_business_type as enum ('RETAIL', 'SERVICES');
alter table public.tenants add column business_type public.tenant_business_type not null default 'RETAIL';

create type public.appointment_status as enum ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW');

create table public.agenda_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 2000),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  price numeric(12, 2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_services_tenant_id_id_key unique (tenant_id, id)
);

create index agenda_services_tenant_active_idx on public.agenda_services (tenant_id) where is_active;

create table public.agenda_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  professional_user_id uuid not null references public.profiles (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'SCHEDULED',
  origin text check (origin is null or origin ~ '^[a-z][a-z_]{1,29}$'),
  notes text check (notes is null or char_length(notes) <= 1000),
  canceled_reason text check (canceled_reason is null or char_length(canceled_reason) <= 500),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_appointments_tenant_id_id_key unique (tenant_id, id),
  constraint agenda_appointments_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint agenda_appointments_service_fkey foreign key (tenant_id, service_id)
    references public.agenda_services (tenant_id, id) on delete restrict,
  constraint agenda_appointments_time_valid check (ends_at > starts_at),
  -- Nunca dois compromissos ativos do mesmo profissional no mesmo intervalo,
  -- garantido pelo próprio Postgres (sem lock manual, sem corrida possível).
  exclude using gist (
    tenant_id with =,
    professional_user_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('SCHEDULED', 'CONFIRMED'))
);

create index agenda_appointments_tenant_starts_idx on public.agenda_appointments (tenant_id, starts_at);
create index agenda_appointments_customer_idx on public.agenda_appointments (customer_id);
create unique index agenda_appointments_idempotency_key
  on public.agenda_appointments (tenant_id, idempotency_key) where idempotency_key is not null;

create trigger agenda_services_set_updated_at before update on public.agenda_services
  for each row execute function private.set_updated_at();
create trigger agenda_appointments_set_updated_at before update on public.agenda_appointments
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('agenda.read', 'agenda', 'Consultar catálogo de serviços e agendamentos'),
  ('agenda.write', 'agenda', 'Criar, mover e cancelar agendamentos e serviços');

insert into public.role_permissions (role_code, permission_code)
select r.code, p.code
from public.roles r
cross join unnest(array['agenda.read', 'agenda.write']) as p(code)
where r.code in ('OWNER', 'ADMIN', 'GERENTE', 'VENDEDOR');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.agenda_services enable row level security;
alter table public.agenda_appointments enable row level security;

create policy agenda_services_select on public.agenda_services for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('agenda.read')));
create policy agenda_appointments_select on public.agenda_appointments for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('agenda.read')));

revoke all on public.agenda_services, public.agenda_appointments from anon, authenticated;
grant select on public.agenda_services, public.agenda_appointments to authenticated;
grant all on public.agenda_services, public.agenda_appointments to service_role;

create trigger agenda_services_audit after update on public.agenda_services
  for each row execute function private.audit_row_update('agenda_service', 'tenant_id');
create trigger agenda_appointments_audit after update on public.agenda_appointments
  for each row execute function private.audit_row_update('agenda_appointment', 'tenant_id');

-- -----------------------------------------------------------------------------
-- Catálogo de serviços (RPCs de staff)
-- -----------------------------------------------------------------------------

create or replace function public.agenda_service_create(
  p_tenant_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_price numeric,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_id uuid;
begin
  if not private.has_tenant_permission(p_tenant_id, 'agenda.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    insert into public.agenda_services (tenant_id, name, description, duration_minutes, price, created_by)
    values (p_tenant_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_duration_minutes, p_price, v_uid)
    returning id into v_id;
  exception
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'service';
  end;

  return v_id;
end;
$$;

create or replace function public.agenda_service_update(
  p_service_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_price numeric,
  p_description text default null,
  p_is_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.agenda_services where id = p_service_id;
  if v_tenant_id is null then
    raise exception 'not_found' using errcode = 'P0002', detail = 'service_id';
  end if;
  if not private.has_tenant_permission(v_tenant_id, 'agenda.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    update public.agenda_services set
      name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      duration_minutes = p_duration_minutes,
      price = p_price,
      is_active = p_is_active
    where id = p_service_id;
  exception
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'service';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Agendamentos (RPCs de staff)
-- -----------------------------------------------------------------------------

create or replace function private.load_appointment_for_write(p_appointment_id uuid)
returns public.agenda_appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.agenda_appointments;
begin
  select * into v_appointment from public.agenda_appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_appointment.tenant_id, 'agenda.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_appointment;
end;
$$;

create or replace function public.agenda_appointment_create(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_professional_user_id uuid,
  p_starts_at timestamptz,
  p_notes text default null,
  p_origin text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_duration integer;
  v_appointment_id uuid;
  v_existing_id uuid;
begin
  if not private.has_tenant_permission(p_tenant_id, 'agenda.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and tenant_id = p_tenant_id) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'customer_id';
  end if;

  select duration_minutes into v_duration from public.agenda_services
  where id = p_service_id and tenant_id = p_tenant_id and is_active;
  if v_duration is null then
    raise exception 'not_found' using errcode = 'P0002', detail = 'service_id';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.agenda_appointments
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing_id;
    end if;
  end if;

  begin
    insert into public.agenda_appointments (
      tenant_id, customer_id, service_id, professional_user_id, starts_at, ends_at,
      origin, notes, created_by, idempotency_key
    ) values (
      p_tenant_id, p_customer_id, p_service_id, p_professional_user_id, p_starts_at,
      p_starts_at + (v_duration || ' minutes')::interval,
      p_origin, nullif(btrim(coalesce(p_notes, '')), ''), v_uid, p_idempotency_key
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = '23P01';
    when unique_violation then
      select id into v_existing_id from public.agenda_appointments
      where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
      if v_existing_id is not null then
        return v_existing_id;
      end if;
      raise exception 'invalid_input' using errcode = '22023', detail = 'appointment';
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'appointment';
  end;

  perform private.log_timeline_event(p_tenant_id, p_customer_id, 'appointment.created',
    jsonb_build_object('appointment_id', v_appointment_id, 'service_id', p_service_id));

  return v_appointment_id;
end;
$$;

create or replace function public.agenda_appointment_advance(p_appointment_id uuid, p_status public.appointment_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.agenda_appointments;
  v_allowed boolean;
begin
  v_appointment := private.load_appointment_for_write(p_appointment_id);
  v_allowed := v_appointment.status in ('SCHEDULED', 'CONFIRMED') and p_status in ('CONFIRMED', 'COMPLETED', 'NO_SHOW');
  if not v_allowed then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  update public.agenda_appointments set status = p_status where id = p_appointment_id;
  perform private.log_timeline_event(v_appointment.tenant_id, v_appointment.customer_id, 'appointment.' || lower(p_status::text),
    jsonb_build_object('appointment_id', p_appointment_id));
end;
$$;

create or replace function public.agenda_appointment_cancel(p_appointment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.agenda_appointments;
begin
  v_appointment := private.load_appointment_for_write(p_appointment_id);
  if v_appointment.status in ('COMPLETED', 'CANCELED', 'NO_SHOW') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  update public.agenda_appointments set
    status = 'CANCELED',
    canceled_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_appointment_id;

  perform private.log_timeline_event(v_appointment.tenant_id, v_appointment.customer_id, 'appointment.canceled',
    jsonb_build_object('appointment_id', p_appointment_id, 'reason', p_reason));
end;
$$;

-- -----------------------------------------------------------------------------
-- Ação da IA: agendar um horário (mesma trava de private.require_ai_service_call
-- da Fase 7 — auth.uid() nulo, tenant_ai_settings.enabled e módulo "ai" ligado).
-- Reaproveita a mesma lógica de agenda_appointment_create, mas nunca a RPC de
-- staff (mesmo motivo da Fase 7: reservation_create/ai_reservation_create).
-- -----------------------------------------------------------------------------

create or replace function public.ai_agenda_book(
  p_conversation_id uuid,
  p_service_id uuid,
  p_professional_user_id uuid,
  p_starts_at timestamptz,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_duration integer;
  v_appointment_id uuid;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'conversation_id';
  end if;
  perform private.require_ai_service_call(v_conversation.tenant_id);

  select duration_minutes into v_duration from public.agenda_services
  where id = p_service_id and tenant_id = v_conversation.tenant_id and is_active;
  if v_duration is null then
    raise exception 'not_found' using errcode = 'P0002', detail = 'service_id';
  end if;

  begin
    insert into public.agenda_appointments (
      tenant_id, customer_id, service_id, professional_user_id, starts_at, ends_at, origin, notes
    ) values (
      v_conversation.tenant_id, v_conversation.customer_id, p_service_id, p_professional_user_id, p_starts_at,
      p_starts_at + (v_duration || ' minutes')::interval, 'ai', nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = '23P01';
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'appointment';
  end;

  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'appointment.created',
    jsonb_build_object('appointment_id', v_appointment_id, 'service_id', p_service_id, 'conversation_id', p_conversation_id),
    'AI');

  return v_appointment_id;
end;
$$;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.agenda_service_create(uuid, text, integer, numeric, text),
  public.agenda_service_update(uuid, text, integer, numeric, text, boolean),
  public.agenda_appointment_create(uuid, uuid, uuid, uuid, timestamptz, text, text, text),
  public.agenda_appointment_advance(uuid, public.appointment_status),
  public.agenda_appointment_cancel(uuid, text),
  public.ai_agenda_book(uuid, uuid, uuid, timestamptz, text)
from public, anon;

grant execute on function
  public.agenda_service_create(uuid, text, integer, numeric, text),
  public.agenda_service_update(uuid, text, integer, numeric, text, boolean),
  public.agenda_appointment_create(uuid, uuid, uuid, uuid, timestamptz, text, text, text),
  public.agenda_appointment_advance(uuid, public.appointment_status),
  public.agenda_appointment_cancel(uuid, text),
  public.ai_agenda_book(uuid, uuid, uuid, timestamptz, text)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- create_tenant / admin_create_tenant ganham p_business_type e já semeiam os
-- módulos desligados por padrão para o tipo escolhido. Um parâmetro novo NO
-- FIM da lista, mesmo com default, muda a assinatura da função para o
-- Postgres (vira overload, não substituição) — por isso o DROP explícito das
-- versões antigas antes de recriar, em vez de um CREATE OR REPLACE que
-- deixaria as duas coexistindo.
-- -----------------------------------------------------------------------------

drop function if exists public.create_tenant(text, text);
drop function if exists public.admin_create_tenant(text, text, text);

create or replace function public.create_tenant(
  p_name text,
  p_segment text default 'general',
  p_business_type public.tenant_business_type default 'RETAIL'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_name text := btrim(coalesce(p_name, ''));
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'general');
  v_base text;
  v_slug text;
  v_tenant_id uuid;
  v_attempt int := 0;
begin
  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'name';
  end if;

  if v_segment !~ '^[a-z][a-z_]{1,39}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'segment';
  end if;

  if (select count(*) from public.tenants where created_by = v_uid) >= 10 then
    raise exception 'tenant_limit_reached' using errcode = 'P0001';
  end if;

  v_base := private.slugify(v_name);
  if char_length(v_base) < 3 then
    v_base := btrim('empresa-' || v_base, '-');
  end if;
  v_slug := v_base;

  loop
    begin
      insert into public.tenants (name, slug, segment, business_type, created_by)
      values (v_name, v_slug, v_segment, p_business_type, v_uid)
      returning id into v_tenant_id;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then
        raise exception 'slug_unavailable' using errcode = 'P0001';
      end if;
      v_slug := left(v_base, 50) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    end;
  end loop;

  insert into public.tenant_users (tenant_id, user_id, role_code, status, joined_at)
  values (v_tenant_id, v_uid, 'OWNER', 'ACTIVE', now());

  perform private.install_segment_catalog_templates(v_tenant_id, v_segment);
  perform private.seed_default_module_flags(v_tenant_id, p_business_type);

  perform private.log_audit(
    v_tenant_id, 'tenant.created', 'tenant', v_tenant_id::text,
    null, jsonb_build_object('name', v_name, 'slug', v_slug, 'segment', v_segment, 'business_type', p_business_type)
  );

  return v_tenant_id;
end;
$$;

create or replace function private.seed_default_module_flags(p_tenant_id uuid, p_business_type public.tenant_business_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_business_type = 'SERVICES' then
    insert into public.tenant_module_flags (tenant_id, module_code, enabled)
    select p_tenant_id, m, false from unnest(array['catalog', 'inventory', 'reservations', 'sales']) as m
    on conflict (tenant_id, module_code) do nothing;
  else
    insert into public.tenant_module_flags (tenant_id, module_code, enabled)
    values (p_tenant_id, 'agenda', false)
    on conflict (tenant_id, module_code) do nothing;
  end if;
end;
$$;

create or replace function public.admin_create_tenant(
  p_name text,
  p_segment text,
  p_owner_email text,
  p_business_type public.tenant_business_type default 'RETAIL'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'general');
  v_owner_id uuid;
  v_base text;
  v_slug text;
  v_tenant_id uuid;
  v_attempt int := 0;
begin
  perform private.require_super_admin();

  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'name';
  end if;
  if v_segment !~ '^[a-z][a-z_]{1,39}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'segment';
  end if;

  select u.id into v_owner_id from auth.users u where lower(u.email) = lower(btrim(p_owner_email));
  if v_owner_id is null then
    raise exception 'user_not_found' using errcode = 'P0002', detail = 'owner_email';
  end if;

  v_base := private.slugify(v_name);
  if char_length(v_base) < 3 then
    v_base := btrim('empresa-' || v_base, '-');
  end if;
  v_slug := v_base;

  loop
    begin
      insert into public.tenants (name, slug, segment, business_type, created_by)
      values (v_name, v_slug, v_segment, p_business_type, v_owner_id)
      returning id into v_tenant_id;
      exit;
    exception
      when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt > 5 then
          raise exception 'slug_unavailable' using errcode = 'P0001';
        end if;
        v_slug := left(v_base, 50) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    end;
  end loop;

  insert into public.tenant_users (tenant_id, user_id, role_code, status, joined_at)
  values (v_tenant_id, v_owner_id, 'OWNER', 'ACTIVE', now());

  perform private.install_segment_catalog_templates(v_tenant_id, v_segment);
  perform private.seed_default_module_flags(v_tenant_id, p_business_type);

  perform private.log_platform_audit(
    'tenant.created_by_admin', v_tenant_id, 'tenant', v_tenant_id::text,
    'Criada pelo admin master', null,
    jsonb_build_object(
      'name', v_name, 'slug', v_slug, 'segment', v_segment,
      'business_type', p_business_type, 'owner_user_id', v_owner_id
    )
  );

  return v_tenant_id;
end;
$$;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.create_tenant(text, text, public.tenant_business_type),
  public.admin_create_tenant(text, text, text, public.tenant_business_type)
from public, anon;

grant execute on function
  public.create_tenant(text, text, public.tenant_business_type),
  public.admin_create_tenant(text, text, text, public.tenant_business_type)
to authenticated, service_role;
