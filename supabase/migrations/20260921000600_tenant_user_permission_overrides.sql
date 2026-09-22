-- =============================================================================
-- Permissões personalizadas por usuário: além do papel (OWNER/ADMIN/GERENTE/
-- VENDEDOR), quem tem `users.manage` pode ligar/desligar permissões
-- específicas de um membro, sobrepondo o padrão do papel. Ausência de uma
-- linha aqui = usa o padrão do papel (mesma filosofia "default = papel").
-- Isso é o novo ponto único de verdade: tanto `tenant_ids_with_permission`
-- (usado por TODAS as políticas RLS do sistema) quanto `get_my_permissions`
-- (lista cacheada no contexto da sessão) passam a consultar esta tabela, então
-- o efeito vale em toda parte sem precisar tocar em nenhuma outra migration.
-- =============================================================================

create table public.tenant_user_permission_overrides (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tenant_user_id uuid not null references public.tenant_users (id) on delete cascade,
  permission_code text not null references public.permissions (code),
  granted boolean not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_user_id, permission_code)
);

alter table public.tenant_user_permission_overrides enable row level security;

-- Qualquer membro ativo do tenant pode ler (a tela de usuários precisa disso
-- para mostrar o que está personalizado); escrita só via RPC.
create policy tenant_user_permission_overrides_select on public.tenant_user_permission_overrides
  for select to authenticated
  using (tenant_id in (select private.user_tenant_ids()));

revoke all on public.tenant_user_permission_overrides from anon, authenticated;
grant select on public.tenant_user_permission_overrides to authenticated;
grant all on public.tenant_user_permission_overrides to service_role;

-- -----------------------------------------------------------------------------
-- Ponto único de verdade para "este usuário tem esta permissão neste tenant":
-- override explícito vence; na ausência, cai no padrão do papel. Mesma
-- assinatura de antes (CREATE OR REPLACE) — usado por has_tenant_permission e
-- por dezenas de políticas RLS em todos os módulos já existentes.
-- -----------------------------------------------------------------------------
create or replace function private.tenant_ids_with_permission(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tu.tenant_id
  from public.tenant_users tu
  join public.tenants t on t.id = tu.tenant_id
  where tu.user_id = (select auth.uid())
    and tu.status = 'ACTIVE'
    and t.status = 'ACTIVE'
    and coalesce(
      (
        select o.granted from public.tenant_user_permission_overrides o
        where o.tenant_user_id = tu.id and o.permission_code = p_permission
      ),
      exists (
        select 1 from public.role_permissions rp
        where rp.role_code = tu.role_code and rp.permission_code = p_permission
      )
    );
$$;

create or replace function public.get_my_permissions(p_tenant_id uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.code
  from public.permissions p
  join public.tenant_users tu
    on tu.tenant_id = p_tenant_id and tu.user_id = (select auth.uid()) and tu.status = 'ACTIVE'
  join public.tenants t on t.id = tu.tenant_id and t.status = 'ACTIVE'
  where coalesce(
    (
      select o.granted from public.tenant_user_permission_overrides o
      where o.tenant_user_id = tu.id and o.permission_code = p.code
    ),
    exists (
      select 1 from public.role_permissions rp
      where rp.role_code = tu.role_code and rp.permission_code = p.code
    )
  )
  order by p.code;
$$;

-- Lista todas as permissões do catálogo com o valor EFETIVO para um membro
-- (papel + override) e também o padrão puro do papel (role_default), pra
-- tela de edição saber quais caixas marcar E, ao salvar, gravar override só
-- onde a pessoa realmente destoou do papel (edição some quando volta ao padrão).
create or replace function public.list_tenant_user_permissions(p_membership_id uuid)
returns table (permission_code text, granted boolean, is_override boolean, role_default boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.tenant_users;
begin
  perform private.require_user();
  select * into v_member from public.tenant_users where id = p_membership_id;
  if v_member.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_member.tenant_id, 'users.read') then
    raise exception 'forbidden' using errcode = '42501';
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

-- Substitui TODO o conjunto de overrides do membro pelo enviado (mesma
-- convenção de "troca o conjunto inteiro" usada em agenda_service_set_professionals).
-- p_overrides: jsonb array [{"code": "sales.discount", "granted": false}, ...].
create or replace function public.set_tenant_user_permissions(p_membership_id uuid, p_overrides jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_member public.tenant_users;
  v_actor_rank smallint;
  v_item jsonb;
  v_code text;
  v_granted jsonb;
begin
  v_member := private.lock_membership(p_membership_id);
  v_actor_rank := private.require_permission(v_member.tenant_id, 'users.manage');
  perform private.assert_can_manage_member(v_actor_rank, v_member);

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

  perform private.log_audit(
    v_member.tenant_id, 'tenant_user.permissions_changed', 'tenant_user', v_member.id::text,
    null, p_overrides, jsonb_build_object('user_id', v_member.user_id)
  );
end;
$$;

revoke all on function
  public.list_tenant_user_permissions(uuid),
  public.set_tenant_user_permissions(uuid, jsonb)
from public, anon;

grant execute on function
  public.list_tenant_user_permissions(uuid),
  public.set_tenant_user_permissions(uuid, jsonb)
to authenticated, service_role;
