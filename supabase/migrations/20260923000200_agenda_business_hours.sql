-- =============================================================================
-- Horário de funcionamento da empresa + exceções por profissional (folga
-- pontual, sem precisar reativar no dia seguinte — a ausência de linha já
-- significa "disponível de novo").
--
-- "Default aberto", mesma filosofia de agenda_service_professionals: tenant
-- sem nenhuma linha em tenant_business_hours pra um dia = sem restrição
-- configurada, agendamento permitido. V1: um único intervalo por dia (sem
-- pausa de almoço, sem virar meia-noite).
--
-- Exceção de agenda é AUTOATENDIMENTO: o próprio profissional registra sua
-- folga pra si mesmo, sem precisar de agenda.write; staff com agenda.write
-- também pode registrar em nome de outro (pedido do usuário: "ela registra
-- isso" — a pessoa, não necessariamente um gerente).
-- =============================================================================

create table public.tenant_business_hours (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=domingo, igual ao extract(dow from ...) do Postgres
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, day_of_week),
  check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.agenda_professional_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  professional_user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  reason text check (reason is null or char_length(reason) <= 280),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, professional_user_id, date)
);

create index agenda_professional_exceptions_lookup_idx
  on public.agenda_professional_exceptions (tenant_id, professional_user_id, date);

create trigger tenant_business_hours_set_updated_at before update on public.tenant_business_hours
  for each row execute function private.set_updated_at();

alter table public.tenant_business_hours enable row level security;
alter table public.agenda_professional_exceptions enable row level security;

create policy tenant_business_hours_select on public.tenant_business_hours for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('agenda.read')));
create policy agenda_professional_exceptions_select on public.agenda_professional_exceptions for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('agenda.read')));

revoke all on public.tenant_business_hours, public.agenda_professional_exceptions from anon, authenticated;
grant select on public.tenant_business_hours, public.agenda_professional_exceptions to authenticated;
grant all on public.tenant_business_hours, public.agenda_professional_exceptions to service_role;

-- -----------------------------------------------------------------------------
-- Horário de funcionamento
-- -----------------------------------------------------------------------------

create or replace function public.agenda_business_hours_set(p_tenant_id uuid, p_hours jsonb)
returns setof public.tenant_business_hours
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_item jsonb;
begin
  if not private.has_tenant_permission(p_tenant_id, 'agenda.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_hours) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'hours';
  end if;

  for v_item in select * from jsonb_array_elements(p_hours) loop
    begin
      insert into public.tenant_business_hours (tenant_id, day_of_week, opens_at, closes_at, is_closed, updated_by)
      values (
        p_tenant_id,
        (v_item->>'day_of_week')::smallint,
        nullif(v_item->>'opens_at', '')::time,
        nullif(v_item->>'closes_at', '')::time,
        coalesce((v_item->>'is_closed')::boolean, false),
        v_uid
      )
      on conflict (tenant_id, day_of_week) do update set
        opens_at = excluded.opens_at,
        closes_at = excluded.closes_at,
        is_closed = excluded.is_closed,
        updated_by = excluded.updated_by,
        updated_at = now();
    exception
      when check_violation or invalid_text_representation or numeric_value_out_of_range then
        raise exception 'invalid_input' using errcode = '22023', detail = 'hours';
    end;
  end loop;

  return query select * from public.tenant_business_hours where tenant_id = p_tenant_id order by day_of_week;
end;
$$;

create or replace function public.agenda_business_hours_get(p_tenant_id uuid)
returns setof public.tenant_business_hours
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'agenda.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select * from public.tenant_business_hours where tenant_id = p_tenant_id order by day_of_week;
end;
$$;

-- -----------------------------------------------------------------------------
-- Exceções por profissional (autoatendimento)
-- -----------------------------------------------------------------------------

create or replace function public.agenda_professional_exception_create(
  p_tenant_id uuid,
  p_professional_user_id uuid,
  p_date date,
  p_reason text default null
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
  if not (v_uid = p_professional_user_id or private.has_tenant_permission(p_tenant_id, 'agenda.write')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tenant_users where tenant_id = p_tenant_id and user_id = p_professional_user_id and status = 'ACTIVE'
  ) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'professional_user_id';
  end if;

  begin
    insert into public.agenda_professional_exceptions (tenant_id, professional_user_id, date, reason, created_by)
    values (p_tenant_id, p_professional_user_id, p_date, nullif(btrim(coalesce(p_reason, '')), ''), v_uid)
    on conflict (tenant_id, professional_user_id, date) do update set reason = excluded.reason
    returning id into v_id;
  exception
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'exception';
  end;

  return v_id;
end;
$$;

create or replace function public.agenda_professional_exception_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_exception public.agenda_professional_exceptions;
begin
  select * into v_exception from public.agenda_professional_exceptions where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (v_uid = v_exception.professional_user_id or private.has_tenant_permission(v_exception.tenant_id, 'agenda.write')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.agenda_professional_exceptions where id = p_id;
end;
$$;

create or replace function public.agenda_professional_exceptions_list(
  p_tenant_id uuid,
  p_professional_user_id uuid default null,
  p_from date default current_date,
  p_to date default null
)
returns setof public.agenda_professional_exceptions
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'agenda.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select * from public.agenda_professional_exceptions
  where tenant_id = p_tenant_id
    and (p_professional_user_id is null or professional_user_id = p_professional_user_id)
    and date >= p_from
    and (p_to is null or date <= p_to)
  order by date;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helpers de validação (usados por agenda_appointment_create e ai_agenda_book).
-- -----------------------------------------------------------------------------

create or replace function private.assert_within_business_hours(
  p_tenant_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_starts_local timestamp;
  v_ends_local timestamp;
  v_day smallint;
  v_hours public.tenant_business_hours;
begin
  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  v_starts_local := p_starts_at at time zone coalesce(v_timezone, 'America/Sao_Paulo');
  v_ends_local := p_ends_at at time zone coalesce(v_timezone, 'America/Sao_Paulo');
  v_day := extract(dow from v_starts_local);

  select * into v_hours from public.tenant_business_hours
  where tenant_id = p_tenant_id and day_of_week = v_day;

  if not found then
    return; -- sem configuração pra esse dia = default aberto
  end if;

  if v_hours.is_closed
     or v_starts_local::date <> v_ends_local::date
     or v_starts_local::time < v_hours.opens_at
     or v_ends_local::time > v_hours.closes_at
  then
    raise exception 'outside_business_hours' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.assert_professional_available(
  p_tenant_id uuid,
  p_professional_user_id uuid,
  p_starts_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_local_date date;
begin
  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  v_local_date := (p_starts_at at time zone coalesce(v_timezone, 'America/Sao_Paulo'))::date;

  if exists (
    select 1 from public.agenda_professional_exceptions
    where tenant_id = p_tenant_id and professional_user_id = p_professional_user_id and date = v_local_date
  ) then
    raise exception 'professional_unavailable' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- agenda_appointment_create / ai_agenda_book passam a validar horário de
-- funcionamento e exceção do profissional (CREATE OR REPLACE: mesma
-- assinatura, só as duas checagens novas, logo depois da elegibilidade).
-- -----------------------------------------------------------------------------

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
  v_ends_at timestamptz;
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

  perform private.assert_professional_can_perform_service(p_tenant_id, p_service_id, p_professional_user_id);
  v_ends_at := p_starts_at + (v_duration || ' minutes')::interval;
  perform private.assert_within_business_hours(p_tenant_id, p_starts_at, v_ends_at);
  perform private.assert_professional_available(p_tenant_id, p_professional_user_id, p_starts_at);

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
      p_tenant_id, p_customer_id, p_service_id, p_professional_user_id, p_starts_at, v_ends_at,
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
  v_ends_at timestamptz;
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

  perform private.assert_professional_can_perform_service(v_conversation.tenant_id, p_service_id, p_professional_user_id);
  v_ends_at := p_starts_at + (v_duration || ' minutes')::interval;
  perform private.assert_within_business_hours(v_conversation.tenant_id, p_starts_at, v_ends_at);
  perform private.assert_professional_available(v_conversation.tenant_id, p_professional_user_id, p_starts_at);

  begin
    insert into public.agenda_appointments (
      tenant_id, customer_id, service_id, professional_user_id, starts_at, ends_at, origin, notes
    ) values (
      v_conversation.tenant_id, v_conversation.customer_id, p_service_id, p_professional_user_id, p_starts_at, v_ends_at,
      'ai', nullif(btrim(coalesce(p_notes, '')), '')
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
  public.agenda_business_hours_set(uuid, jsonb),
  public.agenda_business_hours_get(uuid),
  public.agenda_professional_exception_create(uuid, uuid, date, text),
  public.agenda_professional_exception_delete(uuid),
  public.agenda_professional_exceptions_list(uuid, uuid, date, date)
from public, anon;

grant execute on function
  public.agenda_business_hours_set(uuid, jsonb),
  public.agenda_business_hours_get(uuid),
  public.agenda_professional_exception_create(uuid, uuid, date, text),
  public.agenda_professional_exception_delete(uuid),
  public.agenda_professional_exceptions_list(uuid, uuid, date, date)
to authenticated, service_role;
