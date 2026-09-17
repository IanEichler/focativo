-- =============================================================================
-- FASE 1 · Base do Super Admin
--
-- O SUPER_ADMIN enxerga tabelas de plataforma (tenants, associações, perfis)
-- via RLS e métricas agregadas via RPC. NÃO possui leitura livre dos dados
-- comerciais dos tenants.
-- =============================================================================

create or replace function private.require_super_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  if not private.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public.admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_super_admin();

  select jsonb_build_object(
    'tenants', jsonb_build_object(
      'total', count(*),
      'active', count(*) filter (where t.status = 'ACTIVE'),
      'suspended', count(*) filter (where t.status = 'SUSPENDED'),
      'canceled', count(*) filter (where t.status = 'CANCELED'),
      'new_this_month', count(*) filter (where t.created_at >= date_trunc('month', now()))
    ),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new_this_month', (select count(*) from public.profiles p where p.created_at >= date_trunc('month', now())),
      'active_memberships', (select count(*) from public.tenant_users tu where tu.status = 'ACTIVE'),
      'pending_invitations', (select count(*) from public.tenant_users tu where tu.status = 'INVITED')
    ),
    'generated_at', now()
  )
  into v_result
  from public.tenants t;

  return v_result;
end;
$$;

-- Lista paginada com agregados por empresa.
create or replace function public.admin_list_tenants(
  p_search text default null,
  p_status public.tenant_status default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  status public.tenant_status,
  segment text,
  created_at timestamptz,
  owner_name text,
  owner_email text,
  active_users bigint,
  last_activity_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform private.require_super_admin();

  return query
    with filtered as (
      select t.*
      from public.tenants t
      where (p_status is null or t.status = p_status)
        and (
          v_search is null
          or t.name ilike '%' || v_search || '%'
          or t.slug ilike '%' || v_search || '%'
        )
    )
    select
      f.id, f.name, f.slug, f.status, f.segment, f.created_at,
      owner.full_name, owner.email,
      (select count(*) from public.tenant_users tu where tu.tenant_id = f.id and tu.status = 'ACTIVE'),
      (select max(a.created_at) from public.audit_logs a where a.tenant_id = f.id),
      count(*) over ()
    from filtered f
    left join lateral (
      select p.full_name, p.email
      from public.tenant_users tu
      join public.profiles p on p.id = tu.user_id
      where tu.tenant_id = f.id and tu.role_code = 'OWNER' and tu.status = 'ACTIVE'
      order by tu.joined_at nulls last
      limit 1
    ) owner on true
    order by f.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_set_tenant_status(
  p_tenant_id uuid,
  p_status public.tenant_status,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_old public.tenant_status;
begin
  perform private.require_super_admin();

  if char_length(v_reason) < 5 or char_length(v_reason) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;

  select status into v_old from public.tenants where id = p_tenant_id for update;
  if v_old is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_old = p_status then
    return;
  end if;

  -- Rotula o registro gerado pelo trigger de auditoria do tenant.
  perform set_config('app.actor_type', 'PLATFORM_ADMIN', true);
  update public.tenants set status = p_status where id = p_tenant_id;
  perform set_config('app.actor_type', '', true);

  perform private.log_platform_audit(
    'tenant.status_changed', p_tenant_id, 'tenant', p_tenant_id::text, v_reason,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status)
  );
end;
$$;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.admin_platform_overview(),
  public.admin_list_tenants(text, public.tenant_status, int, int),
  public.admin_set_tenant_status(uuid, public.tenant_status, text)
from public, anon;

grant execute on function
  public.admin_platform_overview(),
  public.admin_list_tenants(text, public.tenant_status, int, int),
  public.admin_set_tenant_status(uuid, public.tenant_status, text)
to authenticated, service_role;
