-- =============================================================================
-- Segundo provider de IA (Gemini), escolhido por tenant — mesma tabela
-- admin-master-only de modelo/limites (tenant_ai_platform_limits), já que
-- "qual provider" é a mesma categoria de decisão que "qual modelo": da
-- plataforma, nunca do tenant.
-- =============================================================================

alter table public.tenant_ai_platform_limits
  add column provider text not null default 'anthropic' check (provider in ('anthropic', 'gemini'));

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
    v_limits.provider := 'anthropic';
    v_limits.model := 'claude-sonnet-5';
    v_limits.max_tokens_per_reply := 1024;
  end if;
  return next v_limits;
end;
$$;

-- Aridade cresceu (ganhou p_provider) — DROP explícito, senão o Postgres
-- cria um overload novo em vez de substituir a função existente.
drop function if exists public.admin_ai_platform_limits_set(uuid, text, integer, integer);

create or replace function public.admin_ai_platform_limits_set(
  p_tenant_id uuid,
  p_model text,
  p_max_tokens_per_reply integer default 1024,
  p_monthly_budget_cents integer default null,
  p_provider text default 'anthropic'
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
    insert into public.tenant_ai_platform_limits (
      tenant_id, provider, model, max_tokens_per_reply, monthly_budget_cents, updated_by
    ) values (
      p_tenant_id, btrim(p_provider), btrim(p_model), coalesce(p_max_tokens_per_reply, 1024), p_monthly_budget_cents, v_uid
    )
    on conflict (tenant_id) do update set
      provider = excluded.provider,
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
    null, jsonb_build_object('provider', v_limits.provider, 'model', v_limits.model,
      'max_tokens_per_reply', v_limits.max_tokens_per_reply, 'monthly_budget_cents', v_limits.monthly_budget_cents)
  );

  return next v_limits;
end;
$$;

revoke all on all functions in schema private from public, anon;

revoke execute on function public.admin_ai_platform_limits_set(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.admin_ai_platform_limits_set(uuid, text, integer, integer, text) to authenticated, service_role;
