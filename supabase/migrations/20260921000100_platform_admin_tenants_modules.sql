-- =============================================================================
-- Admin master: criar empresas direto do painel + módulos habilitáveis por empresa
--
-- `tenant_module_flags` é "default-ligado": a ausência de uma linha para um
-- módulo significa habilitado (mesma filosofia de `tenant_ai_settings`, só
-- que invertida — lá "ausente" = desligado porque IA custa dinheiro; aqui
-- "ausente" = ligado porque um tenant novo não deveria nascer quebrado até
-- o admin master lembrar de habilitar tudo). O admin master só grava uma
-- linha quando DESLIGA algo; religar é simplesmente apagar essa linha (ou
-- marcar enabled = true, ambos tratados da mesma forma pela leitura).
--
-- Só os módulos "opcionais" do plano entram aqui (whatsapp, ai, crm,
-- reports) — catálogo/estoque/vendas/reservas/clientes/financeiro são o
-- núcleo do produto e não fazem sentido como algo que se desliga por tenant.
-- =============================================================================

create table public.tenant_module_flags (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_code text not null check (module_code ~ '^[a-z][a-z_]{1,39}$'),
  enabled boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_code)
);

alter table public.tenant_module_flags enable row level security;

-- Qualquer membro ativo do tenant pode ler (precisa disso pra montar a
-- navegação corretamente, não é um dado sensível); escrita só via RPC.
create policy tenant_module_flags_select on public.tenant_module_flags for select to authenticated
  using (tenant_id in (select private.user_tenant_ids()));
revoke all on public.tenant_module_flags from anon, authenticated;
grant select on public.tenant_module_flags to authenticated;
grant all on public.tenant_module_flags to service_role;

-- -----------------------------------------------------------------------------
-- admin_create_tenant: o admin master cria a empresa e já designa o dono.
-- A conta do dono precisa existir no Auth ANTES desta chamada (a aplicação
-- convida/cria a conta pela Admin API do Auth e só então chama esta RPC —
-- mesmo padrão de invite_tenant_user, procurando por e-mail).
-- -----------------------------------------------------------------------------

create or replace function public.admin_create_tenant(p_name text, p_segment text, p_owner_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'general');
  v_owner_id uuid;
  v_base text;
  v_slug text;
  v_tenant_id uuid;
  v_attempt int := 0;
begin
  perform private.require_super_admin();

  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'name';
  end if;
  if v_segment !~ '^[a-z][a-z_]{1,39}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'segment';
  end if;

  select u.id into v_owner_id from auth.users u where lower(u.email) = lower(btrim(p_owner_email));
  if v_owner_id is null then
    raise exception 'user_not_found' using errcode = 'P0002', detail = 'owner_email';
  end if;

  v_base := private.slugify(v_name);
  if char_length(v_base) < 3 then
    v_base := btrim('empresa-' || v_base, '-');
  end if;
  v_slug := v_base;

  loop
    begin
      insert into public.tenants (name, slug, segment, created_by)
      values (v_name, v_slug, v_segment, v_owner_id)
      returning id into v_tenant_id;
      exit;
    exception
      when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt > 5 then
          raise exception 'slug_unavailable' using errcode = 'P0001';
        end if;
        v_slug := left(v_base, 50) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    end;
  end loop;

  insert into public.tenant_users (tenant_id, user_id, role_code, status, joined_at)
  values (v_tenant_id, v_owner_id, 'OWNER', 'ACTIVE', now());

  perform private.log_platform_audit(
    'tenant.created_by_admin', v_tenant_id, 'tenant', v_tenant_id::text,
    'Criada pelo admin master', null,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'segment', v_segment, 'owner_user_id', v_owner_id)
  );

  return v_tenant_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Módulos habilitáveis por tenant
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_module_flags(p_tenant_id uuid)
returns setof public.tenant_module_flags
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query select * from public.tenant_module_flags where tenant_id = p_tenant_id;
end;
$$;

create or replace function public.admin_set_module_flag(p_tenant_id uuid, p_module_code text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := private.require_super_admin();

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'tenant_id';
  end if;
  if p_module_code !~ '^[a-z][a-z_]{1,39}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'module_code';
  end if;

  insert into public.tenant_module_flags (tenant_id, module_code, enabled, updated_by)
  values (p_tenant_id, p_module_code, p_enabled, v_uid)
  on conflict (tenant_id, module_code) do update set
    enabled = excluded.enabled,
    updated_by = excluded.updated_by,
    updated_at = now();

  perform private.log_platform_audit(
    'tenant.module_flag_changed', p_tenant_id, 'tenant_module_flags', p_module_code, null,
    null, jsonb_build_object('module_code', p_module_code, 'enabled', p_enabled)
  );
end;
$$;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.admin_create_tenant(text, text, text),
  public.admin_list_module_flags(uuid),
  public.admin_set_module_flag(uuid, text, boolean)
from public, anon;

grant execute on function
  public.admin_create_tenant(text, text, text),
  public.admin_list_module_flags(uuid),
  public.admin_set_module_flag(uuid, text, boolean)
to authenticated, service_role;
