-- =============================================================================
-- Conhecimento de negócio estruturado pra IA: descrição geral, políticas,
-- FAQ e uma ordem sugerida de triagem (orientação textual pro modelo seguir,
-- nunca uma máquina de estados validada no backend) — tudo pra reduzir
-- dúvida da IA sem custo de token alto (ver Fase 4: só o bloco geral entra
-- sempre no prompt; FAQ vira tool sob demanda).
--
-- Cada serviço ganha "restrictions" (texto livre) e
-- "requires_human_confirmation" — quando true, a IA precisa de uma rodada de
-- revisão humana antes de finalizar QUALQUER agendamento desse serviço (ver
-- Fase 4: ai_agenda_book + conversation_return_to_ai). A IA sempre acaba
-- agendando ela mesma — isso não é um bloqueio permanente, só adia a
-- primeira confirmação até um atendente revisar o ticket.
-- =============================================================================

alter table public.agenda_services
  add column requires_human_confirmation boolean not null default false,
  add column restrictions text check (restrictions is null or char_length(restrictions) <= 1000);

create table public.tenant_ai_business_info (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  business_description text check (business_description is null or char_length(business_description) <= 2000),
  general_policies text check (general_policies is null or char_length(general_policies) <= 2000),
  faq jsonb not null default '[]'::jsonb check (jsonb_typeof(faq) = 'array'),
  screening_flow jsonb not null default '[]'::jsonb check (jsonb_typeof(screening_flow) = 'array'),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenant_ai_business_info_set_updated_at before update on public.tenant_ai_business_info
  for each row execute function private.set_updated_at();

alter table public.tenant_ai_business_info enable row level security;

create policy tenant_ai_business_info_select on public.tenant_ai_business_info for select to authenticated
  using (private.has_tenant_permission(tenant_id, 'tenant.update'));
revoke all on public.tenant_ai_business_info from anon, authenticated;
grant select on public.tenant_ai_business_info to authenticated;
grant all on public.tenant_ai_business_info to service_role;

-- -----------------------------------------------------------------------------
-- RPCs (mesma permissão de tenant_ai_settings: quem administra o tenant)
-- -----------------------------------------------------------------------------

create or replace function public.ai_business_info_get(p_tenant_id uuid)
returns setof public.tenant_ai_business_info
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_info public.tenant_ai_business_info;
begin
  if not private.has_tenant_permission(p_tenant_id, 'tenant.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_info from public.tenant_ai_business_info where tenant_id = p_tenant_id;
  if not found then
    v_info.tenant_id := p_tenant_id;
    v_info.faq := '[]'::jsonb;
    v_info.screening_flow := '[]'::jsonb;
  end if;
  return next v_info;
end;
$$;

create or replace function public.ai_business_info_update(
  p_tenant_id uuid,
  p_business_description text default null,
  p_general_policies text default null,
  p_faq jsonb default '[]'::jsonb,
  p_screening_flow jsonb default '[]'::jsonb
)
returns setof public.tenant_ai_business_info
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_info public.tenant_ai_business_info;
  v_item jsonb;
begin
  if not private.has_tenant_permission(p_tenant_id, 'tenant.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if jsonb_typeof(p_faq) <> 'array' or jsonb_typeof(p_screening_flow) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'shape';
  end if;
  if jsonb_array_length(p_faq) > 20 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'faq_length';
  end if;
  if jsonb_array_length(p_screening_flow) > 12 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'screening_flow_length';
  end if;

  for v_item in select * from jsonb_array_elements(p_faq) loop
    if coalesce(jsonb_typeof(v_item->'question'), '') <> 'string'
       or coalesce(jsonb_typeof(v_item->'answer'), '') <> 'string'
       or coalesce(char_length(v_item->>'question'), 0) = 0 or char_length(v_item->>'question') > 200
       or coalesce(char_length(v_item->>'answer'), 0) = 0 or char_length(v_item->>'answer') > 500
    then
      raise exception 'invalid_input' using errcode = '22023', detail = 'faq_item';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_screening_flow) loop
    if jsonb_typeof(v_item) <> 'string' or char_length(v_item#>>'{}') = 0 or char_length(v_item#>>'{}') > 200 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'screening_flow_item';
    end if;
  end loop;

  insert into public.tenant_ai_business_info (
    tenant_id, business_description, general_policies, faq, screening_flow, updated_by
  ) values (
    p_tenant_id, nullif(btrim(coalesce(p_business_description, '')), ''),
    nullif(btrim(coalesce(p_general_policies, '')), ''), p_faq, p_screening_flow, v_uid
  )
  on conflict (tenant_id) do update set
    business_description = excluded.business_description,
    general_policies = excluded.general_policies,
    faq = excluded.faq,
    screening_flow = excluded.screening_flow,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_info;

  return next v_info;
end;
$$;

-- -----------------------------------------------------------------------------
-- agenda_service_create/update ganham os dois campos novos. Aridade muda
-- (cresce) — DROP explícito antes do CREATE OR REPLACE, senão o Postgres cria
-- um overload novo em vez de substituir.
-- -----------------------------------------------------------------------------

drop function if exists public.agenda_service_create(uuid, text, integer, numeric, text);

create or replace function public.agenda_service_create(
  p_tenant_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_price numeric,
  p_description text default null,
  p_requires_human_confirmation boolean default false,
  p_restrictions text default null
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
    insert into public.agenda_services (
      tenant_id, name, description, duration_minutes, price, requires_human_confirmation, restrictions, created_by
    ) values (
      p_tenant_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_duration_minutes, p_price,
      p_requires_human_confirmation, nullif(btrim(coalesce(p_restrictions, '')), ''), v_uid
    )
    returning id into v_id;
  exception
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'service';
  end;

  return v_id;
end;
$$;

drop function if exists public.agenda_service_update(uuid, text, integer, numeric, text, boolean);

create or replace function public.agenda_service_update(
  p_service_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_price numeric,
  p_description text default null,
  p_is_active boolean default true,
  p_requires_human_confirmation boolean default false,
  p_restrictions text default null
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
      is_active = p_is_active,
      requires_human_confirmation = p_requires_human_confirmation,
      restrictions = nullif(btrim(coalesce(p_restrictions, '')), '')
    where id = p_service_id;
  exception
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'service';
  end;
end;
$$;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.ai_business_info_get(uuid),
  public.ai_business_info_update(uuid, text, text, jsonb, jsonb),
  public.agenda_service_create(uuid, text, integer, numeric, text, boolean, text),
  public.agenda_service_update(uuid, text, integer, numeric, text, boolean, boolean, text)
from public, anon;

grant execute on function
  public.ai_business_info_get(uuid),
  public.ai_business_info_update(uuid, text, text, jsonb, jsonb),
  public.agenda_service_create(uuid, text, integer, numeric, text, boolean, text),
  public.agenda_service_update(uuid, text, integer, numeric, text, boolean, boolean, text)
to authenticated, service_role;
