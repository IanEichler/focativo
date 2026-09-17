-- =============================================================================
-- FASE 1 · FUNDAÇÃO
-- Identidade, tenants, RBAC, auditoria e helpers de RLS.
--
-- Convenções:
--   * Toda tabela com dados de empresa possui tenant_id + RLS.
--   * Funções auxiliares de segurança vivem no schema `private`, que NÃO é
--     exposto pela API (PostgREST). São SECURITY DEFINER com search_path vazio.
--   * Erros de regra de negócio usam mensagens-código estáveis (ex.: 'forbidden')
--     que a aplicação traduz para mensagens amigáveis.
--   * Privilégios são concedidos explicitamente; nada depende dos grants padrão.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Utilitários genéricos
-- -----------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only' using errcode = '42501', detail = tg_table_name;
end;
$$;

-- Correlation id enviado pela aplicação no header x-request-id (PostgREST expõe
-- os headers da requisição em request.headers).
create or replace function private.current_request_id()
returns text
language sql
stable
set search_path = ''
as $$
  select left(nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-request-id', ''), 64);
$$;

create or replace function private.slugify(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    trim(both '-' from regexp_replace(
      lower(translate(
        coalesce(p_value, ''),
        'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'
      )),
      '[^a-z0-9]+', '-', 'g'
    )),
    50
  );
$$;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type public.tenant_status as enum ('ACTIVE', 'SUSPENDED', 'CANCELED');
create type public.membership_status as enum ('INVITED', 'ACTIVE', 'DISABLED');
create type public.audit_actor_type as enum ('USER', 'SYSTEM', 'AI', 'INTEGRATION', 'PLATFORM_ADMIN');

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 32),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, full_name)
    values (
      new.id,
      lower(new.email),
      left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120)
    )
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_change();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_auth_user_change();

-- -----------------------------------------------------------------------------
-- SUPER_ADMIN (papel global da plataforma, fora do RBAC do tenant)
-- Não existe policy de escrita: só migration/service role concede.
-- -----------------------------------------------------------------------------

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  granted_by uuid,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- RBAC: papéis e permissões (dados de referência da plataforma)
-- -----------------------------------------------------------------------------

create table public.roles (
  code text primary key check (code ~ '^[A-Z][A-Z_]{1,31}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  rank smallint not null unique check (rank > 0),
  created_at timestamptz not null default now()
);

create table public.permissions (
  code text primary key check (code ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  module text not null check (module ~ '^[a-z][a-z_]*$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_code text not null references public.roles (code) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role_code, permission_code)
);

create index role_permissions_permission_idx on public.role_permissions (permission_code);

-- -----------------------------------------------------------------------------
-- Tenants (empresas)
-- -----------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  legal_name text check (legal_name is null or char_length(legal_name) <= 160),
  document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 32),
  segment text not null default 'general' check (segment ~ '^[a-z][a-z_]{1,39}$'),
  timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) between 3 and 64),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status public.tenant_status not null default 'ACTIVE',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  onboarding_completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenants_status_idx on public.tenants (status);
create index tenants_created_at_idx on public.tenants (created_at desc);
create index tenants_created_by_idx on public.tenants (created_by);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Associação usuário ↔ tenant
-- -----------------------------------------------------------------------------

create table public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_code text not null references public.roles (code),
  status public.membership_status not null default 'INVITED',
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_users_unique_member unique (tenant_id, user_id),
  constraint tenant_users_active_has_joined check (status <> 'ACTIVE' or joined_at is not null)
);

create index tenant_users_user_status_idx on public.tenant_users (user_id, status) include (tenant_id, role_code);
create index tenant_users_tenant_status_idx on public.tenant_users (tenant_id, status);

create trigger tenant_users_set_updated_at
  before update on public.tenant_users
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auditoria (append-only)
-- actor_user_id não possui FK de propósito: o registro precisa sobreviver à
-- remoção do usuário.
-- -----------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  actor_user_id uuid,
  actor_type public.audit_actor_type not null default 'USER',
  action text not null check (action ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  entity text not null check (char_length(entity) between 1 and 64),
  entity_id text check (entity_id is null or char_length(entity_id) <= 64),
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  request_id text check (request_id is null or char_length(request_id) <= 64),
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_tenant_entity_idx on public.audit_logs (tenant_id, entity, entity_id);

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function private.prevent_mutation();

create table public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null check (action ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  target_tenant_id uuid references public.tenants (id) on delete set null,
  entity text not null check (char_length(entity) between 1 and 64),
  entity_id text check (entity_id is null or char_length(entity_id) <= 64),
  reason text check (reason is null or char_length(reason) <= 1000),
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  request_id text check (request_id is null or char_length(request_id) <= 64),
  created_at timestamptz not null default now()
);

create index platform_audit_logs_created_idx on public.platform_audit_logs (created_at desc);
create index platform_audit_logs_tenant_idx on public.platform_audit_logs (target_tenant_id, created_at desc);

-- Imutável, exceto pelo SET NULL de target_tenant_id (FK) — por isso só DELETE
-- e alterações de conteúdo são bloqueados.
create or replace function private.platform_audit_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only' using errcode = '42501', detail = tg_table_name;
  end if;
  if (to_jsonb(new) - 'target_tenant_id') is distinct from (to_jsonb(old) - 'target_tenant_id') then
    raise exception 'append_only' using errcode = '42501', detail = tg_table_name;
  end if;
  return new;
end;
$$;

create trigger platform_audit_logs_append_only
  before update or delete on public.platform_audit_logs
  for each row execute function private.platform_audit_guard();

-- -----------------------------------------------------------------------------
-- Helpers de segurança (usados nas policies de RLS)
--
-- Padrão de policy: `tenant_id in (select private.user_tenant_ids())`
-- O subselect é avaliado uma vez por query (initPlan), não por linha.
--
-- Ponto único de extensão: impersonation futura do SUPER_ADMIN entra aqui.
-- -----------------------------------------------------------------------------

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())
  );
$$;

-- Tenants com associação ATIVA (leitura). Tenants SUSPENDED continuam legíveis;
-- CANCELED ficam inacessíveis.
create or replace function private.user_tenant_ids()
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
    and t.status <> 'CANCELED';
$$;

-- Tenants onde o usuário possui a permissão. Exige tenant ACTIVE: empresas
-- suspensas ficam somente-leitura no nível do banco.
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
  join public.role_permissions rp on rp.role_code = tu.role_code
  where tu.user_id = (select auth.uid())
    and tu.status = 'ACTIVE'
    and t.status = 'ACTIVE'
    and rp.permission_code = p_permission;
$$;

create or replace function private.has_tenant_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.tenant_ids_with_permission(p_permission) t(tenant_id)
    where t.tenant_id = p_tenant_id
  );
$$;

-- Perfis visíveis: colegas de qualquer tenant onde o usuário é membro ativo.
create or replace function private.visible_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct other.user_id
  from public.tenant_users me
  join public.tenant_users other on other.tenant_id = me.tenant_id
  where me.user_id = (select auth.uid())
    and me.status = 'ACTIVE';
$$;

-- -----------------------------------------------------------------------------
-- Escrita de auditoria
-- -----------------------------------------------------------------------------

create or replace function private.log_audit(
  p_tenant_id uuid,
  p_action text,
  p_entity text,
  p_entity_id text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_type public.audit_actor_type default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    tenant_id, actor_user_id, actor_type, action, entity, entity_id,
    before, after, metadata, request_id
  )
  values (
    p_tenant_id,
    (select auth.uid()),
    coalesce(
      p_actor_type,
      nullif(current_setting('app.actor_type', true), '')::public.audit_actor_type,
      case when (select auth.uid()) is null then 'SYSTEM' else 'USER' end::public.audit_actor_type
    ),
    p_action, p_entity, p_entity_id, p_before, p_after,
    coalesce(p_metadata, '{}'::jsonb),
    private.current_request_id()
  );
$$;

create or replace function private.log_platform_audit(
  p_action text,
  p_target_tenant_id uuid,
  p_entity text,
  p_entity_id text,
  p_reason text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_audit_logs (
    actor_user_id, action, target_tenant_id, entity, entity_id, reason,
    before, after, metadata, request_id
  )
  values (
    (select auth.uid()), p_action, p_target_tenant_id, p_entity, p_entity_id, p_reason,
    p_before, p_after, coalesce(p_metadata, '{}'::jsonb), private.current_request_id()
  );
$$;

-- Trigger genérico: registra somente as colunas alteradas.
-- tg_argv[0] = nome da entidade · tg_argv[1] = coluna com o tenant_id
create or replace function private.audit_row_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_key text;
begin
  for v_key in select jsonb_object_keys(v_new) loop
    continue when v_key in ('updated_at');
    if (v_old -> v_key) is distinct from (v_new -> v_key) then
      v_before := v_before || jsonb_build_object(v_key, v_old -> v_key);
      v_after := v_after || jsonb_build_object(v_key, v_new -> v_key);
    end if;
  end loop;

  if v_after <> '{}'::jsonb then
    perform private.log_audit(
      (v_new ->> tg_argv[1])::uuid,
      tg_argv[0] || '.updated',
      tg_argv[0],
      v_new ->> 'id',
      v_before,
      v_after
    );
  end if;
  return new;
end;
$$;

create trigger tenants_audit_update
  after update on public.tenants
  for each row execute function private.audit_row_update('tenant', 'id');

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_users enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_audit_logs enable row level security;

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.visible_profile_ids())
    or (select private.is_super_admin())
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- platform_admins: o usuário só descobre se ELE é super admin
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_super_admin()));

-- dados de referência
create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- tenants
create policy tenants_select on public.tenants
  for select to authenticated
  using (
    id in (select private.user_tenant_ids())
    or (select private.is_super_admin())
  );

create policy tenants_update on public.tenants
  for update to authenticated
  using (id in (select private.tenant_ids_with_permission('tenant.update')))
  with check (id in (select private.tenant_ids_with_permission('tenant.update')));

-- tenant_users
create policy tenant_users_select on public.tenant_users
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or tenant_id in (select private.user_tenant_ids())
    or (select private.is_super_admin())
  );

-- audit
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (tenant_id in (select private.tenant_ids_with_permission('audit.read')));

create policy platform_audit_logs_select on public.platform_audit_logs
  for select to authenticated
  using ((select private.is_super_admin()));

-- -----------------------------------------------------------------------------
-- Privilégios explícitos
-- -----------------------------------------------------------------------------

revoke all on
  public.profiles, public.platform_admins, public.roles, public.permissions,
  public.role_permissions, public.tenants, public.tenant_users,
  public.audit_logs, public.platform_audit_logs
from anon, authenticated;

grant select on
  public.profiles, public.platform_admins, public.roles, public.permissions,
  public.role_permissions, public.tenants, public.tenant_users,
  public.audit_logs, public.platform_audit_logs
to authenticated;

grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
grant update (name, legal_name, document, email, phone, segment, timezone, settings)
  on public.tenants to authenticated;

grant all on
  public.profiles, public.platform_admins, public.roles, public.permissions,
  public.role_permissions, public.tenants, public.tenant_users,
  public.audit_logs, public.platform_audit_logs
to service_role;

revoke all on all functions in schema private from public, anon;
grant execute on function
  private.is_super_admin(),
  private.user_tenant_ids(),
  private.tenant_ids_with_permission(text),
  private.has_tenant_permission(uuid, text),
  private.visible_profile_ids()
to authenticated;

-- -----------------------------------------------------------------------------
-- Dados de referência: papéis e permissões da Fase 1
-- (novas permissões são adicionadas pelas migrations de cada módulo)
-- -----------------------------------------------------------------------------

insert into public.roles (code, name, description, rank) values
  ('OWNER',    'Proprietário', 'Controle completo da empresa.', 40),
  ('ADMIN',    'Administrador', 'Administração operacional.', 30),
  ('GERENTE',  'Gerente', 'Gestão de estoque, comercial e relatórios.', 20),
  ('VENDEDOR', 'Vendedor', 'Atendimento, clientes, reservas e vendas.', 10);

insert into public.permissions (code, module, description) values
  ('tenant.update',  'tenant', 'Editar dados e configurações da empresa'),
  ('users.read',     'users',  'Visualizar usuários da empresa'),
  ('users.invite',   'users',  'Convidar usuários'),
  ('users.manage',   'users',  'Alterar papel, desativar e remover usuários'),
  ('audit.read',     'audit',  'Visualizar registros de auditoria');

insert into public.role_permissions (role_code, permission_code) values
  ('OWNER', 'tenant.update'), ('OWNER', 'users.read'), ('OWNER', 'users.invite'),
  ('OWNER', 'users.manage'), ('OWNER', 'audit.read'),
  ('ADMIN', 'tenant.update'), ('ADMIN', 'users.read'), ('ADMIN', 'users.invite'),
  ('ADMIN', 'users.manage'), ('ADMIN', 'audit.read'),
  ('GERENTE', 'users.read');
