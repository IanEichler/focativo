-- =============================================================================
-- Admin master gerenciando usuários DE DENTRO de qualquer empresa: criar,
-- remover e personalizar permissões — sem precisar ser membro do tenant.
-- Espelham invite_tenant_user/remove_tenant_user/set_tenant_user_permissions/
-- list_tenant_user_permissions, mas gated por require_super_admin() em vez de
-- has_tenant_permission (mesmo padrão de admin_create_tenant vs create_tenant),
-- e registram em platform_audit_logs (não em audit_logs do tenant).
-- =============================================================================

create or replace function public.admin_invite_tenant_user(p_tenant_id uuid, p_email text, p_role_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_member public.tenant_users;
  v_id uuid;
begin
  perform private.require_super_admin();

  if not exists (select 1 from public.roles where code = p_role_code) then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select u.id into v_target from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_target is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  select * into v_member from public.tenant_users
  where tenant_id = p_tenant_id and user_id = v_target
  for update;

  if found then
    if v_member.status <> 'DISABLED' then
      raise exception 'already_member' using errcode = '23505';
    end if;
    update public.tenant_users
    set role_code = p_role_code, status = 'INVITED', invited_by = null, invited_at = now(), joined_at = null
    where id = v_member.id
    returning id into v_id;
  else
    insert into public.tenant_users (tenant_id, user_id, role_code, status, invited_at)
    values (p_tenant_id, v_target, p_role_code, 'INVITED', now())
    returning id into v_id;
  end if;

  perform private.log_platform_audit(
    'tenant_user.created_by_admin', p_tenant_id, 'tenant_user', v_id::text,
    'Criado pelo admin master',
    case when v_member.id is null then null
         else jsonb_build_object('role_code', v_member.role_code, 'status', v_member.status) end,
    jsonb_build_object('user_id', v_target, 'role_code', p_role_code, 'status', 'INVITED')
  );

  return v_id;
end;
$$;

create or replace function public.admin_remove_tenant_user(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.tenant_users;
begin
  perform private.require_super_admin();
  v_member := private.lock_membership(p_membership_id);
  perform private.assert_not_last_owner(v_member);

  delete from public.tenant_users where id = v_member.id;

  perform private.log_platform_audit(
    'tenant_user.removed_by_admin', v_member.tenant_id, 'tenant_user', v_member.id::text,
    'Removido pelo admin master',
    jsonb_build_object('user_id', v_member.user_id, 'role_code', v_member.role_code, 'status', v_member.status),
    null
  );
end;
$$;

create or replace function public.admin_list_tenant_user_permissions(p_membership_id uuid)
returns table (permission_code text, granted boolean, is_override boolean, role_default boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.tenant_users;
begin
  perform private.require_super_admin();
  select * into v_member from public.tenant_users where id = p_membership_id;
  if v_member.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return query
    select
      p.code,
      coalesce(o.granted, rp.permission_code is not null),
      (o.permission_code is not null),
      (rp.permission_code is not null)
    from public.permissions p
    left join public.role_permissions rp on rp.role_code = v_member.role_code and rp.permission_code = p.code
    left join public.tenant_user_permission_overrides o
      on o.tenant_user_id = v_member.id and o.permission_code = p.code
    order by p.code;
end;
$$;

create or replace function public.admin_set_tenant_user_permissions(p_membership_id uuid, p_overrides jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_member public.tenant_users;
  v_item jsonb;
  v_code text;
  v_granted jsonb;
begin
  v_uid := private.require_super_admin();
  v_member := private.lock_membership(p_membership_id);

  if jsonb_typeof(p_overrides) is distinct from 'array' then
    raise exception 'invalid_overrides' using errcode = '22023';
  end if;

  delete from public.tenant_user_permission_overrides where tenant_user_id = v_member.id;

  for v_item in select * from jsonb_array_elements(p_overrides) loop
    v_code := v_item ->> 'code';
    v_granted := v_item -> 'granted';

    if v_code is null or not exists (select 1 from public.permissions where code = v_code) then
      raise exception 'invalid_permission_code' using errcode = '22023';
    end if;
    if jsonb_typeof(v_granted) is distinct from 'boolean' then
      raise exception 'invalid_overrides' using errcode = '22023';
    end if;

    insert into public.tenant_user_permission_overrides (tenant_id, tenant_user_id, permission_code, granted, updated_by)
    values (v_member.tenant_id, v_member.id, v_code, (v_granted #>> '{}')::boolean, v_uid);
  end loop;

  perform private.log_platform_audit(
    'tenant_user.permissions_changed_by_admin', v_member.tenant_id, 'tenant_user', v_member.id::text,
    'Permissões personalizadas pelo admin master',
    null, p_overrides
  );
end;
$$;

revoke all on function
  public.admin_invite_tenant_user(uuid, text, text),
  public.admin_remove_tenant_user(uuid),
  public.admin_list_tenant_user_permissions(uuid),
  public.admin_set_tenant_user_permissions(uuid, jsonb)
from public, anon;

grant execute on function
  public.admin_invite_tenant_user(uuid, text, text),
  public.admin_remove_tenant_user(uuid),
  public.admin_list_tenant_user_permissions(uuid),
  public.admin_set_tenant_user_permissions(uuid, jsonb)
to authenticated, service_role;
