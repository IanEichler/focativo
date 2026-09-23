-- =============================================================================
-- Separa "modelo de IA e limites" (agora só do admin master da plataforma) de
-- "comportamento" (continua com o tenant, em tenant_ai_settings). Pedido
-- explícito: o dono do tenant não deve mais ver nem editar modelo, limite de
-- tokens ou orçamento — isso é decisão da plataforma, não do cliente.
--
-- Dado existente migra para a tabela nova ANTES das colunas serem
-- derrubadas de tenant_ai_settings, sem perda.
-- =============================================================================

create table public.tenant_ai_platform_limits (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  model text not null default 'claude-sonnet-5',
  max_tokens_per_reply integer not null default 1024 check (max_tokens_per_reply between 64 and 4096),
  monthly_budget_cents integer check (monthly_budget_cents is null or monthly_budget_cents >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenant_ai_platform_limits (tenant_id, model, max_tokens_per_reply, monthly_budget_cents, created_at, updated_at)
select tenant_id, model, max_tokens_per_reply, monthly_budget_cents, created_at, updated_at
from public.tenant_ai_settings;

alter table public.tenant_ai_settings
  drop column model,
  drop column max_tokens_per_reply,
  drop column monthly_budget_cents;

create trigger tenant_ai_platform_limits_set_updated_at before update on public.tenant_ai_platform_limits
  for each row execute function private.set_updated_at();

alter table public.tenant_ai_platform_limits enable row level security;

-- Só o admin master enxerga — nem o dono do tenant tem select direto aqui
-- (diferente de tenant_ai_settings, que o próprio tenant lê).
create policy tenant_ai_platform_limits_select on public.tenant_ai_platform_limits for select to authenticated
  using ((select private.is_super_admin()));

revoke all on public.tenant_ai_platform_limits from anon, authenticated;
grant select on public.tenant_ai_platform_limits to authenticated;
grant all on public.tenant_ai_platform_limits to service_role;

-- -----------------------------------------------------------------------------
-- RPCs do admin master
-- -----------------------------------------------------------------------------

create or replace function public.admin_ai_platform_limits_get(p_tenant_id uuid)
returns setof public.tenant_ai_platform_limits
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limits public.tenant_ai_platform_limits;
begin
  perform private.require_super_admin();
  select * into v_limits from public.tenant_ai_platform_limits where tenant_id = p_tenant_id;
  if not found then
    v_limits.tenant_id := p_tenant_id;
    v_limits.model := 'claude-sonnet-5';
    v_limits.max_tokens_per_reply := 1024;
  end if;
  return next v_limits;
end;
$$;

create or replace function public.admin_ai_platform_limits_set(
  p_tenant_id uuid,
  p_model text,
  p_max_tokens_per_reply integer default 1024,
  p_monthly_budget_cents integer default null
)
returns setof public.tenant_ai_platform_limits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_limits public.tenant_ai_platform_limits;
begin
  v_uid := private.require_super_admin();

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'tenant_id';
  end if;

  begin
    insert into public.tenant_ai_platform_limits (tenant_id, model, max_tokens_per_reply, monthly_budget_cents, updated_by)
    values (p_tenant_id, btrim(p_model), coalesce(p_max_tokens_per_reply, 1024), p_monthly_budget_cents, v_uid)
    on conflict (tenant_id) do update set
      model = excluded.model,
      max_tokens_per_reply = excluded.max_tokens_per_reply,
      monthly_budget_cents = excluded.monthly_budget_cents,
      updated_by = excluded.updated_by,
      updated_at = now()
    returning * into v_limits;
  exception
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'ai_platform_limits';
  end;

  perform private.log_platform_audit(
    'ai.platform_limits_changed', p_tenant_id, 'tenant_ai_platform_limits', p_tenant_id::text, null,
    null, jsonb_build_object('model', v_limits.model, 'max_tokens_per_reply', v_limits.max_tokens_per_reply,
      'monthly_budget_cents', v_limits.monthly_budget_cents)
  );

  return next v_limits;
end;
$$;

-- -----------------------------------------------------------------------------
-- ai_settings_update/get do tenant: aridade encolhe (6 -> 3 parâmetros) —
-- precisa do DROP explícito, senão o Postgres cria um overload novo e deixa
-- os dois coexistindo (ambíguo pra chamadas com só os parâmetros comuns).
-- -----------------------------------------------------------------------------

drop function if exists public.ai_settings_update(uuid, boolean, text, text, integer, integer);

create or replace function public.ai_settings_get(p_tenant_id uuid)
returns setof public.tenant_ai_settings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.tenant_ai_settings;
begin
  if not private.has_tenant_permission(p_tenant_id, 'tenant.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_settings from public.tenant_ai_settings where tenant_id = p_tenant_id;
  if not found then
    v_settings.tenant_id := p_tenant_id;
    v_settings.enabled := false;
  end if;
  return next v_settings;
end;
$$;

create or replace function public.ai_settings_update(
  p_tenant_id uuid,
  p_enabled boolean,
  p_system_prompt text default null
)
returns setof public.tenant_ai_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_settings public.tenant_ai_settings;
begin
  if not private.has_tenant_permission(p_tenant_id, 'tenant.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.tenant_ai_settings (tenant_id, enabled, system_prompt, updated_by)
  values (p_tenant_id, p_enabled, nullif(btrim(coalesce(p_system_prompt, '')), ''), v_uid)
  on conflict (tenant_id) do update set
    enabled = excluded.enabled,
    system_prompt = excluded.system_prompt,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_settings;

  perform private.log_audit(p_tenant_id, 'ai.settings_updated', 'tenant_ai_settings', p_tenant_id::text,
    p_after => jsonb_build_object('enabled', p_enabled));

  return next v_settings;
end;
$$;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.admin_ai_platform_limits_get(uuid),
  public.admin_ai_platform_limits_set(uuid, text, integer, integer),
  public.ai_settings_get(uuid),
  public.ai_settings_update(uuid, boolean, text)
from public, anon;

grant execute on function
  public.admin_ai_platform_limits_get(uuid),
  public.admin_ai_platform_limits_set(uuid, text, integer, integer),
  public.ai_settings_get(uuid),
  public.ai_settings_update(uuid, boolean, text)
to authenticated, service_role;
