-- =============================================================================
-- Criação direta (com senha) não deveria deixar a pessoa em "convite
-- pendente" — ela já tem login e senha prontos, então o vínculo já nasce
-- ACTIVE. `invite_tenant_user`/`admin_invite_tenant_user` ganham um novo
-- parâmetro `p_active` (default false, preserva o comportamento do convite
-- por e-mail) — como é um parâmetro NOVO ao final da lista, precisa do DROP
-- explícito antes do CREATE OR REPLACE (mesma armadilha de overload já vista
-- em create_tenant/admin_create_tenant nesta base).
-- =============================================================================

drop function if exists public.invite_tenant_user(uuid, text, text);
drop function if exists public.admin_invite_tenant_user(uuid, text, text);

create or replace function public.invite_tenant_user(
  p_tenant_id uuid, p_email text, p_role_code text, p_active boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_actor_rank smallint;
  v_target uuid;
  v_member public.tenant_users;
  v_id uuid;
  v_status public.membership_status := case when p_active then 'ACTIVE' else 'INVITED' end;
  v_joined_at timestamptz := case when p_active then now() else null end;
begin
  if not private.has_tenant_permission(p_tenant_id, 'users.invite') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.lock_tenant(p_tenant_id);
  v_actor_rank := private.require_permission(p_tenant_id, 'users.invite');
  perform private.assert_can_assign_role(v_actor_rank, p_role_code);

  select u.id into v_target from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_target is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_target = v_uid then
    raise exception 'cannot_modify_self' using errcode = '42501';
  end if;

  select * into v_member from public.tenant_users
  where tenant_id = p_tenant_id and user_id = v_target
  for update;

  if found then
    if v_member.status <> 'DISABLED' then
      raise exception 'already_member' using errcode = '23505';
    end if;
    perform private.assert_can_manage_member(v_actor_rank, v_member);

    update public.tenant_users
    set role_code = p_role_code, status = v_status, invited_by = v_uid,
        invited_at = now(), joined_at = v_joined_at
    where id = v_member.id
    returning id into v_id;
  else
    insert into public.tenant_users (tenant_id, user_id, role_code, status, invited_by, invited_at, joined_at)
    values (p_tenant_id, v_target, p_role_code, v_status, v_uid, now(), v_joined_at)
    returning id into v_id;
  end if;

  perform private.log_audit(
    p_tenant_id, 'tenant_user.invited', 'tenant_user', v_id::text,
    case when v_member.id is null then null
         else jsonb_build_object('role_code', v_member.role_code, 'status', v_member.status) end,
    jsonb_build_object('user_id', v_target, 'role_code', p_role_code, 'status', v_status)
  );

  return v_id;
end;
$$;

create or replace function public.admin_invite_tenant_user(
  p_tenant_id uuid, p_email text, p_role_code text, p_active boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_member public.tenant_users;
  v_id uuid;
  v_status public.membership_status := case when p_active then 'ACTIVE' else 'INVITED' end;
  v_joined_at timestamptz := case when p_active then now() else null end;
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
    set role_code = p_role_code, status = v_status, invited_by = null, invited_at = now(), joined_at = v_joined_at
    where id = v_member.id
    returning id into v_id;
  else
    insert into public.tenant_users (tenant_id, user_id, role_code, status, invited_at, joined_at)
    values (p_tenant_id, v_target, p_role_code, v_status, now(), v_joined_at)
    returning id into v_id;
  end if;

  perform private.log_platform_audit(
    'tenant_user.created_by_admin', p_tenant_id, 'tenant_user', v_id::text,
    'Criado pelo admin master',
    case when v_member.id is null then null
         else jsonb_build_object('role_code', v_member.role_code, 'status', v_member.status) end,
    jsonb_build_object('user_id', v_target, 'role_code', p_role_code, 'status', v_status)
  );

  return v_id;
end;
$$;

revoke all on function
  public.invite_tenant_user(uuid, text, text, boolean),
  public.admin_invite_tenant_user(uuid, text, text, boolean)
from public, anon;

grant execute on function
  public.invite_tenant_user(uuid, text, text, boolean),
  public.admin_invite_tenant_user(uuid, text, text, boolean)
to authenticated, service_role;
