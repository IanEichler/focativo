-- =============================================================================
-- Vínculo profissional ↔ serviço: numa clínica com vários especialistas,
-- nem todo profissional faz todo serviço (ex.: só a Dra. Souza faz
-- dermatologia). "Default aberto" como o resto do sistema de módulos: um
-- serviço SEM nenhuma linha aqui pode ser atendido por qualquer profissional
-- ativo (compatível com os serviços já cadastrados antes desta migration);
-- assim que o primeiro vínculo é criado, o serviço passa a aceitar só os
-- profissionais listados.
-- =============================================================================

create table public.agenda_service_professionals (
  tenant_id uuid not null,
  service_id uuid not null,
  professional_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (service_id, professional_user_id),
  constraint agenda_service_professionals_service_fkey foreign key (tenant_id, service_id)
    references public.agenda_services (tenant_id, id) on delete cascade
);

create index agenda_service_professionals_professional_idx on public.agenda_service_professionals (professional_user_id);

alter table public.agenda_service_professionals enable row level security;

create policy agenda_service_professionals_select on public.agenda_service_professionals for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('agenda.read')));

revoke all on public.agenda_service_professionals from anon, authenticated;
grant select on public.agenda_service_professionals to authenticated;
grant all on public.agenda_service_professionals to service_role;

-- -----------------------------------------------------------------------------
-- Helper: valida se o profissional pode atender o serviço (default aberto).
-- -----------------------------------------------------------------------------

create or replace function private.assert_professional_can_perform_service(
  p_tenant_id uuid,
  p_service_id uuid,
  p_professional_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.agenda_service_professionals where service_id = p_service_id)
     and not exists (
       select 1 from public.agenda_service_professionals
       where service_id = p_service_id and professional_user_id = p_professional_user_id
     )
  then
    raise exception 'professional_not_eligible' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Define a lista completa de profissionais de um serviço (substitui o
-- conjunto anterior — mesmo padrão de catalog_set_attribute_values). Lista
-- vazia = volta a aceitar qualquer profissional.
-- -----------------------------------------------------------------------------

create or replace function public.agenda_service_set_professionals(p_service_id uuid, p_professional_user_ids uuid[])
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

  delete from public.agenda_service_professionals where service_id = p_service_id;

  if p_professional_user_ids is not null and array_length(p_professional_user_ids, 1) > 0 then
    insert into public.agenda_service_professionals (tenant_id, service_id, professional_user_id)
    select v_tenant_id, p_service_id, u
    from unnest(p_professional_user_ids) as u
    where exists (select 1 from public.tenant_users where tenant_id = v_tenant_id and user_id = u and status = 'ACTIVE');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- agenda_appointment_create / ai_agenda_book passam a validar a elegibilidade
-- (CREATE OR REPLACE: mesma assinatura, só a checagem nova).
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

  perform private.assert_professional_can_perform_service(v_conversation.tenant_id, p_service_id, p_professional_user_id);

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

revoke execute on function public.agenda_service_set_professionals(uuid, uuid[]) from public, anon;
grant execute on function public.agenda_service_set_professionals(uuid, uuid[]) to authenticated, service_role;
