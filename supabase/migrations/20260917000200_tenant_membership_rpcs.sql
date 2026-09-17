-- =============================================================================
-- FASE 1 · RPCs de tenants e associação de usuários
--
-- Toda escrita em tenants/tenant_users passa por estas funções. Não existem
-- grants de INSERT/UPDATE/DELETE em tenant_users para `authenticated`.
--
-- Regras de hierarquia:
--   * OWNER pode tudo (inclusive conceder OWNER).
--   * Demais papéis só atribuem papéis de rank INFERIOR ao seu e só gerenciam
--     membros cujo papel atual tem rank INFERIOR ao seu.
--   * Ninguém altera o próprio papel/status por estas funções.
--   * Um tenant nunca fica sem OWNER ativo (serializado por lock no tenant).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Asserções internas
-- -----------------------------------------------------------------------------

create or replace function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Retorna o rank do ator no tenant, validando a permissão exigida.
create or replace function private.require_permission(p_tenant_id uuid, p_permission text)
returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rank smallint;
begin
  perform private.require_user();

  if not private.has_tenant_permission(p_tenant_id, p_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select r.rank into v_rank
  from public.tenant_users tu
  join public.roles r on r.code = tu.role_code
  where tu.tenant_id = p_tenant_id
    and tu.user_id = (select auth.uid())
    and tu.status = 'ACTIVE';

  return v_rank;
end;
$$;

create or replace function private.owner_rank()
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select rank from public.roles where code = 'OWNER';
$$;

-- Valida se um ator com p_actor_rank pode atribuir p_role_code.
create or replace function private.assert_can_assign_role(p_actor_rank smallint, p_role_code text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target_rank smallint;
begin
  select r.rank into v_target_rank from public.roles r where r.code = p_role_code;

  if v_target_rank is null then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_actor_rank < private.owner_rank() and v_target_rank >= p_actor_rank then
    raise exception 'role_hierarchy' using errcode = '42501';
  end if;
end;
$$;

-- Valida se um ator com p_actor_rank pode gerenciar a associação alvo.
create or replace function private.assert_can_manage_member(p_actor_rank smallint, p_member public.tenant_users)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_rank smallint;
begin
  if p_member.user_id = (select auth.uid()) then
    raise exception 'cannot_modify_self' using errcode = '42501';
  end if;

  select r.rank into v_member_rank from public.roles r where r.code = p_member.role_code;

  if p_actor_rank < private.owner_rank() and v_member_rank >= p_actor_rank then
    raise exception 'role_hierarchy' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_not_last_owner(p_member public.tenant_users)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_member.role_code = 'OWNER'
     and p_member.status = 'ACTIVE'
     and not exists (
       select 1 from public.tenant_users tu
       where tu.tenant_id = p_member.tenant_id
         and tu.role_code = 'OWNER'
         and tu.status = 'ACTIVE'
         and tu.id <> p_member.id
     ) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
end;
$$;

-- Serializa mutações de associação por tenant (evita corrida no "último OWNER").
create or replace function private.lock_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Carrega e trava a associação; serializa pelo tenant antes.
create or replace function private.lock_membership(p_membership_id uuid)
returns public.tenant_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_member public.tenant_users;
begin
  select tenant_id into v_tenant_id from public.tenant_users where id = p_membership_id;
  if v_tenant_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.lock_tenant(v_tenant_id);

  select * into v_member from public.tenant_users where id = p_membership_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_member;
end;
$$;

-- -----------------------------------------------------------------------------
-- Criação de empresa (onboarding)
-- -----------------------------------------------------------------------------

create or replace function public.create_tenant(p_name text, p_segment text default 'general')
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

  -- Proteção anti-abuso (limites comerciais ficam nos planos).
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
      insert into public.tenants (name, slug, segment, created_by)
      values (v_name, v_slug, v_segment, v_uid)
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

  perform private.log_audit(
    v_tenant_id, 'tenant.created', 'tenant', v_tenant_id::text,
    null, jsonb_build_object('name', v_name, 'slug', v_slug, 'segment', v_segment)
  );

  return v_tenant_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consulta de permissões / papéis atribuíveis
-- -----------------------------------------------------------------------------

create or replace function public.get_my_permissions(p_tenant_id uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select rp.permission_code
  from public.tenant_users tu
  join public.tenants t on t.id = tu.tenant_id
  join public.role_permissions rp on rp.role_code = tu.role_code
  where tu.tenant_id = p_tenant_id
    and tu.user_id = (select auth.uid())
    and tu.status = 'ACTIVE'
    and t.status = 'ACTIVE'
  order by rp.permission_code;
$$;

create or replace function public.list_assignable_roles(p_tenant_id uuid)
returns setof public.roles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rank smallint;
begin
  if not private.has_tenant_permission(p_tenant_id, 'users.invite')
     and not private.has_tenant_permission(p_tenant_id, 'users.manage') then
    return;
  end if;

  select r.rank into v_rank
  from public.tenant_users tu
  join public.roles r on r.code = tu.role_code
  where tu.tenant_id = p_tenant_id and tu.user_id = (select auth.uid()) and tu.status = 'ACTIVE';

  return query
    select r.* from public.roles r
    where v_rank >= private.owner_rank() or r.rank < v_rank
    order by r.rank desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Convites
-- -----------------------------------------------------------------------------

-- Requer que a conta (auth.users) já exista; a aplicação cria/convida a conta
-- pelo Admin API do Supabase ANTES de chamar esta função.
create or replace function public.invite_tenant_user(p_tenant_id uuid, p_email text, p_role_code text)
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
begin
  -- Permissão validada após o lock para não usar um papel alterado em paralelo.
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
    set role_code = p_role_code, status = 'INVITED', invited_by = v_uid,
        invited_at = now(), joined_at = null
    where id = v_member.id
    returning id into v_id;
  else
    insert into public.tenant_users (tenant_id, user_id, role_code, status, invited_by, invited_at)
    values (p_tenant_id, v_target, p_role_code, 'INVITED', v_uid, now())
    returning id into v_id;
  end if;

  perform private.log_audit(
    p_tenant_id, 'tenant_user.invited', 'tenant_user', v_id::text,
    case when v_member.id is null then null
         else jsonb_build_object('role_code', v_member.role_code, 'status', v_member.status) end,
    jsonb_build_object('user_id', v_target, 'role_code', p_role_code, 'status', 'INVITED')
  );

  return v_id;
end;
$$;

create or replace function public.list_my_invitations()
returns table (
  membership_id uuid,
  tenant_id uuid,
  tenant_name text,
  role_code text,
  role_name text,
  invited_by_name text,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select tu.id, t.id, t.name, r.code, r.name,
         nullif(coalesce(nullif(p.full_name, ''), p.email), ''), tu.invited_at
  from public.tenant_users tu
  join public.tenants t on t.id = tu.tenant_id
  join public.roles r on r.code = tu.role_code
  left join public.profiles p on p.id = tu.invited_by
  where tu.user_id = (select auth.uid())
    and tu.status = 'INVITED'
    and t.status = 'ACTIVE'
  order by tu.invited_at desc nulls last;
$$;

create or replace function public.accept_tenant_invitation(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_id uuid;
begin
  update public.tenant_users tu
  set status = 'ACTIVE', joined_at = now()
  from public.tenants t
  where t.id = tu.tenant_id
    and t.status = 'ACTIVE'
    and tu.tenant_id = p_tenant_id
    and tu.user_id = v_uid
    and tu.status = 'INVITED'
  returning tu.id into v_id;

  if v_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.log_audit(
    p_tenant_id, 'tenant_user.joined', 'tenant_user', v_id::text,
    jsonb_build_object('status', 'INVITED'), jsonb_build_object('status', 'ACTIVE')
  );
end;
$$;

create or replace function public.decline_tenant_invitation(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_id uuid;
begin
  delete from public.tenant_users
  where tenant_id = p_tenant_id and user_id = v_uid and status = 'INVITED'
  returning id into v_id;

  if v_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.log_audit(
    p_tenant_id, 'tenant_user.declined', 'tenant_user', v_id::text,
    jsonb_build_object('status', 'INVITED'), null
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Gestão de membros
-- -----------------------------------------------------------------------------

create or replace function public.update_tenant_user_role(p_membership_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.tenant_users;
  v_actor_rank smallint;
begin
  perform private.require_user();
  v_member := private.lock_membership(p_membership_id);
  v_actor_rank := private.require_permission(v_member.tenant_id, 'users.manage');
  perform private.assert_can_manage_member(v_actor_rank, v_member);
  perform private.assert_can_assign_role(v_actor_rank, p_role_code);

  if v_member.role_code = p_role_code then
    return;
  end if;

  if p_role_code <> 'OWNER' then
    perform private.assert_not_last_owner(v_member);
  end if;

  update public.tenant_users set role_code = p_role_code where id = v_member.id;

  perform private.log_audit(
    v_member.tenant_id, 'tenant_user.role_changed', 'tenant_user', v_member.id::text,
    jsonb_build_object('role_code', v_member.role_code),
    jsonb_build_object('role_code', p_role_code),
    jsonb_build_object('user_id', v_member.user_id)
  );
end;
$$;

create or replace function public.set_tenant_user_status(p_membership_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.tenant_users;
  v_actor_rank smallint;
  v_new_status public.membership_status;
begin
  perform private.require_user();
  v_member := private.lock_membership(p_membership_id);
  v_actor_rank := private.require_permission(v_member.tenant_id, 'users.manage');
  perform private.assert_can_manage_member(v_actor_rank, v_member);

  if p_active then
    if v_member.status <> 'DISABLED' then
      return;
    end if;
    v_new_status := case when v_member.joined_at is null then 'INVITED' else 'ACTIVE' end;
  else
    if v_member.status = 'DISABLED' then
      return;
    end if;
    perform private.assert_not_last_owner(v_member);
    v_new_status := 'DISABLED';
  end if;

  update public.tenant_users set status = v_new_status where id = v_member.id;

  perform private.log_audit(
    v_member.tenant_id,
    case when p_active then 'tenant_user.enabled' else 'tenant_user.disabled' end,
    'tenant_user', v_member.id::text,
    jsonb_build_object('status', v_member.status),
    jsonb_build_object('status', v_new_status),
    jsonb_build_object('user_id', v_member.user_id)
  );
end;
$$;

create or replace function public.remove_tenant_user(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.tenant_users;
  v_actor_rank smallint;
begin
  perform private.require_user();
  v_member := private.lock_membership(p_membership_id);
  v_actor_rank := private.require_permission(v_member.tenant_id, 'users.manage');
  perform private.assert_can_manage_member(v_actor_rank, v_member);
  perform private.assert_not_last_owner(v_member);

  delete from public.tenant_users where id = v_member.id;

  perform private.log_audit(
    v_member.tenant_id, 'tenant_user.removed', 'tenant_user', v_member.id::text,
    jsonb_build_object('user_id', v_member.user_id, 'role_code', v_member.role_code, 'status', v_member.status),
    null
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.create_tenant(text, text),
  public.get_my_permissions(uuid),
  public.list_assignable_roles(uuid),
  public.invite_tenant_user(uuid, text, text),
  public.list_my_invitations(),
  public.accept_tenant_invitation(uuid),
  public.decline_tenant_invitation(uuid),
  public.update_tenant_user_role(uuid, text),
  public.set_tenant_user_status(uuid, boolean),
  public.remove_tenant_user(uuid)
from public, anon;

grant execute on function
  public.create_tenant(text, text),
  public.get_my_permissions(uuid),
  public.list_assignable_roles(uuid),
  public.invite_tenant_user(uuid, text, text),
  public.list_my_invitations(),
  public.accept_tenant_invitation(uuid),
  public.decline_tenant_invitation(uuid),
  public.update_tenant_user_role(uuid, text),
  public.set_tenant_user_status(uuid, boolean),
  public.remove_tenant_user(uuid)
to authenticated, service_role;
