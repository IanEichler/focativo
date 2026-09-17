-- =============================================================================
-- FASE 2 · Catálogo: cadastros base
-- Categorias, marcas, fornecedores, catálogos globais (alérgenos, nutrientes)
-- e definição de atributos dinâmicos.
--
-- Integridade multi-tenant: tabelas de tenant expõem unique (tenant_id, id) e
-- as referências usam FK composta (tenant_id, x_id). Assim o banco impede que um
-- registro aponte para dados de outra empresa, independentemente do RLS.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Normalização para busca (minúsculas, sem acentos). IMMUTABLE para uso em índices.
create or replace function private.search_normalize(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_value, '')));
$$;

-- -----------------------------------------------------------------------------
-- Helpers de permissão para LEITURA (tenant ACTIVE ou SUSPENDED)
-- -----------------------------------------------------------------------------

create or replace function private.readable_tenant_ids_with_permission(p_permission text)
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
    and t.status in ('ACTIVE', 'SUSPENDED')
    and rp.permission_code = p_permission;
$$;

-- Trigger de auditoria: agora aceita coluna de id alternativa (tg_argv[2]).
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
    continue when v_key in ('updated_at', 'search_text');
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
      v_new ->> coalesce(tg_argv[2], 'id'),
      v_before,
      v_after
    );
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type public.tri_state as enum ('TRUE', 'FALSE', 'UNKNOWN');
create type public.attribute_data_type as enum ('BOOLEAN', 'NUMBER', 'TEXT', 'ENUM');
create type public.info_source as enum ('LABEL', 'MANUFACTURER', 'TECHNICAL_SHEET', 'MANUAL');

-- -----------------------------------------------------------------------------
-- Categorias (hierarquia de até 3 níveis)
-- -----------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_tenant_id_id_key unique (tenant_id, id),
  constraint categories_parent_fkey foreign key (tenant_id, parent_id)
    references public.categories (tenant_id, id) on delete restrict,
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create unique index categories_name_unique
  on public.categories (tenant_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index categories_tenant_parent_idx on public.categories (tenant_id, parent_id);

create or replace function private.categories_validate_tree()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_depth int;
  v_cycle boolean;
begin
  if new.parent_id is null then
    return new;
  end if;

  with recursive ancestors (id, parent_id, depth) as (
    select c.id, c.parent_id, 1 from public.categories c where c.id = new.parent_id
    union all
    select c.id, c.parent_id, a.depth + 1
    from public.categories c
    join ancestors a on c.id = a.parent_id
    where a.depth < 10
  )
  select max(depth), bool_or(id = new.id) into v_depth, v_cycle from ancestors;

  if v_cycle then
    raise exception 'category_cycle' using errcode = '23514';
  end if;
  -- pai com profundidade 2 → novo item fica no nível 3 (máximo)
  if v_depth >= 3 then
    raise exception 'category_depth' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger categories_validate_tree
  before insert or update of parent_id on public.categories
  for each row execute function private.categories_validate_tree();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Marcas
-- -----------------------------------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_tenant_id_id_key unique (tenant_id, id)
);

create unique index brands_name_unique on public.brands (tenant_id, lower(btrim(name)));

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Fornecedores
-- -----------------------------------------------------------------------------

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  legal_name text check (legal_name is null or char_length(legal_name) <= 160),
  document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or phone ~ '^[0-9]{10,13}$'),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_tenant_id_id_key unique (tenant_id, id)
);

create unique index suppliers_name_unique on public.suppliers (tenant_id, lower(btrim(name)));
create unique index suppliers_document_unique on public.suppliers (tenant_id, document) where document is not null;

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Catálogos globais da plataforma (somente leitura para tenants)
-- -----------------------------------------------------------------------------

create table public.allergens (
  code text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  name text not null,
  description text not null default '',
  sort_order smallint not null default 0
);

create table public.nutrients (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null,
  unit text not null check (unit in ('kcal', 'g', 'mg', 'mcg')),
  category text not null check (category in ('MACRO', 'MICRO', 'SUPPLEMENT')),
  is_core boolean not null default false,
  sort_order smallint not null default 0
);

-- Principais alérgenos de rotulagem obrigatória (RDC 26/2015) + lactose (RDC 136/2017).
insert into public.allergens (code, name, description, sort_order) values
  ('gluten', 'Glúten', 'Trigo, centeio, cevada, aveia e derivados', 10),
  ('lactose', 'Lactose', 'Açúcar do leite', 20),
  ('milk', 'Leite e derivados', 'Leite de qualquer mamífero e seus derivados (proteínas do leite)', 30),
  ('soy', 'Soja', 'Soja e derivados', 40),
  ('egg', 'Ovos', 'Ovos e derivados', 50),
  ('peanut', 'Amendoim', 'Amendoim e derivados', 60),
  ('tree_nuts', 'Castanhas e nozes', 'Amêndoa, avelã, castanhas, macadâmia, nozes, pecã, pistache, pinoli', 70),
  ('fish', 'Peixes', 'Peixes e derivados', 80),
  ('crustaceans', 'Crustáceos', 'Crustáceos e derivados', 90),
  ('latex', 'Látex natural', 'Látex natural e derivados', 100);

insert into public.nutrients (code, name, unit, category, is_core, sort_order) values
  ('energy', 'Valor energético', 'kcal', 'MACRO', true, 10),
  ('carbohydrates', 'Carboidratos', 'g', 'MACRO', true, 20),
  ('total_sugars', 'Açúcares totais', 'g', 'MACRO', true, 30),
  ('added_sugars', 'Açúcares adicionados', 'g', 'MACRO', true, 40),
  ('protein', 'Proteínas', 'g', 'MACRO', true, 50),
  ('total_fat', 'Gorduras totais', 'g', 'MACRO', true, 60),
  ('saturated_fat', 'Gorduras saturadas', 'g', 'MACRO', true, 70),
  ('trans_fat', 'Gorduras trans', 'g', 'MACRO', true, 80),
  ('fiber', 'Fibras alimentares', 'g', 'MACRO', true, 90),
  ('sodium', 'Sódio', 'mg', 'MACRO', true, 100),
  ('lactose_amount', 'Lactose', 'g', 'MACRO', false, 110),
  ('creatine', 'Creatina', 'g', 'SUPPLEMENT', false, 200),
  ('caffeine', 'Cafeína', 'mg', 'SUPPLEMENT', false, 210),
  ('bcaa', 'BCAA', 'g', 'SUPPLEMENT', false, 220),
  ('leucine', 'Leucina', 'mg', 'SUPPLEMENT', false, 230),
  ('glutamine', 'Glutamina', 'g', 'SUPPLEMENT', false, 240),
  ('beta_alanine', 'Beta-alanina', 'g', 'SUPPLEMENT', false, 250),
  ('calcium', 'Cálcio', 'mg', 'MICRO', false, 300),
  ('iron', 'Ferro', 'mg', 'MICRO', false, 310),
  ('magnesium', 'Magnésio', 'mg', 'MICRO', false, 320),
  ('zinc', 'Zinco', 'mg', 'MICRO', false, 330),
  ('potassium', 'Potássio', 'mg', 'MICRO', false, 340),
  ('vitamin_a', 'Vitamina A', 'mcg', 'MICRO', false, 350),
  ('vitamin_b12', 'Vitamina B12', 'mcg', 'MICRO', false, 360),
  ('vitamin_c', 'Vitamina C', 'mg', 'MICRO', false, 370),
  ('vitamin_d', 'Vitamina D', 'mcg', 'MICRO', false, 380),
  ('vitamin_e', 'Vitamina E', 'mg', 'MICRO', false, 390);

-- -----------------------------------------------------------------------------
-- Atributos dinâmicos (definição por tenant)
-- -----------------------------------------------------------------------------

create table public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 300),
  data_type public.attribute_data_type not null,
  unit text check (unit is null or char_length(unit) between 1 and 16),
  group_name text check (group_name is null or char_length(group_name) <= 40),
  is_searchable boolean not null default true,
  is_filterable boolean not null default false,
  -- utilizável pelo ProductCompatibilityEngine (Fase 3)
  is_compatibility_enabled boolean not null default false,
  -- diferencia variantes (ex.: sabor)
  is_variant_axis boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_attributes_tenant_id_id_key unique (tenant_id, id),
  constraint product_attributes_code_key unique (tenant_id, code),
  constraint product_attributes_unit_only_number check (unit is null or data_type = 'NUMBER'),
  constraint product_attributes_axis_type check (not is_variant_axis or data_type in ('ENUM', 'TEXT'))
);

create unique index product_attributes_name_unique on public.product_attributes (tenant_id, lower(btrim(name)));

create trigger product_attributes_set_updated_at
  before update on public.product_attributes
  for each row execute function private.set_updated_at();

create table public.product_attribute_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  attribute_id uuid not null,
  code text not null check (code ~ '^[a-z0-9][a-z0-9_]{0,49}$'),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_attribute_options_tenant_id_id_key unique (tenant_id, id),
  constraint product_attribute_options_code_key unique (attribute_id, code),
  constraint product_attribute_options_attribute_fkey foreign key (tenant_id, attribute_id)
    references public.product_attributes (tenant_id, id) on delete cascade
);

create unique index product_attribute_options_label_unique
  on public.product_attribute_options (attribute_id, lower(btrim(label)));

create trigger product_attribute_options_set_updated_at
  before update on public.product_attribute_options
  for each row execute function private.set_updated_at();

create or replace function private.attribute_options_require_enum()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.product_attributes a where a.id = new.attribute_id and a.data_type = 'ENUM'
  ) then
    raise exception 'invalid_attribute_value' using errcode = '23514', detail = 'options_require_enum';
  end if;
  return new;
end;
$$;

create trigger product_attribute_options_require_enum
  before insert on public.product_attribute_options
  for each row execute function private.attribute_options_require_enum();

-- -----------------------------------------------------------------------------
-- Templates por segmento (idempotente)
-- -----------------------------------------------------------------------------

create or replace function private.install_segment_catalog_templates(p_tenant_id uuid, p_segment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attribute_id uuid;
begin
  if p_segment <> 'supplements' then
    return;
  end if;

  insert into public.product_attributes
    (tenant_id, code, name, description, data_type, unit, group_name,
     is_searchable, is_filterable, is_compatibility_enabled, is_variant_axis, sort_order)
  values
    (p_tenant_id, 'flavor', 'Sabor', null, 'ENUM', null, 'Produto', true, true, true, true, 10),
    (p_tenant_id, 'net_weight', 'Peso líquido', null, 'NUMBER', 'g', 'Embalagem', true, true, true, false, 20),
    (p_tenant_id, 'presentation', 'Apresentação', null, 'ENUM', null, 'Produto', true, true, true, false, 30),
    (p_tenant_id, 'protein_type', 'Tipo de proteína', null, 'ENUM', null, 'Produto', true, true, true, false, 40),
    (p_tenant_id, 'sugar_free_claim', 'Sem açúcar', 'Alegação "sem açúcar" presente no rótulo', 'BOOLEAN', null, 'Dietas', true, true, true, false, 50),
    (p_tenant_id, 'vegan', 'Vegano', 'Produto declarado vegano pelo fabricante', 'BOOLEAN', null, 'Dietas', true, true, true, false, 60)
  on conflict (tenant_id, code) do nothing;

  select id into v_attribute_id from public.product_attributes where tenant_id = p_tenant_id and code = 'flavor';
  insert into public.product_attribute_options (tenant_id, attribute_id, code, label, sort_order) values
    (p_tenant_id, v_attribute_id, 'natural', 'Natural (sem sabor)', 10),
    (p_tenant_id, v_attribute_id, 'chocolate', 'Chocolate', 20),
    (p_tenant_id, v_attribute_id, 'baunilha', 'Baunilha', 30),
    (p_tenant_id, v_attribute_id, 'morango', 'Morango', 40),
    (p_tenant_id, v_attribute_id, 'cookies_cream', 'Cookies & Cream', 50),
    (p_tenant_id, v_attribute_id, 'banana', 'Banana', 60),
    (p_tenant_id, v_attribute_id, 'frutas_vermelhas', 'Frutas vermelhas', 70),
    (p_tenant_id, v_attribute_id, 'limao', 'Limão', 80),
    (p_tenant_id, v_attribute_id, 'doce_de_leite', 'Doce de leite', 90)
  on conflict (attribute_id, code) do nothing;

  select id into v_attribute_id from public.product_attributes where tenant_id = p_tenant_id and code = 'presentation';
  insert into public.product_attribute_options (tenant_id, attribute_id, code, label, sort_order) values
    (p_tenant_id, v_attribute_id, 'po', 'Pó', 10),
    (p_tenant_id, v_attribute_id, 'capsulas', 'Cápsulas', 20),
    (p_tenant_id, v_attribute_id, 'comprimidos', 'Comprimidos', 30),
    (p_tenant_id, v_attribute_id, 'liquido', 'Líquido', 40),
    (p_tenant_id, v_attribute_id, 'barra', 'Barra', 50),
    (p_tenant_id, v_attribute_id, 'gel', 'Gel', 60)
  on conflict (attribute_id, code) do nothing;

  select id into v_attribute_id from public.product_attributes where tenant_id = p_tenant_id and code = 'protein_type';
  insert into public.product_attribute_options (tenant_id, attribute_id, code, label, sort_order) values
    (p_tenant_id, v_attribute_id, 'whey_concentrado', 'Whey concentrado', 10),
    (p_tenant_id, v_attribute_id, 'whey_isolado', 'Whey isolado', 20),
    (p_tenant_id, v_attribute_id, 'whey_hidrolisado', 'Whey hidrolisado', 30),
    (p_tenant_id, v_attribute_id, 'blend', 'Blend de proteínas', 40),
    (p_tenant_id, v_attribute_id, 'caseina', 'Caseína', 50),
    (p_tenant_id, v_attribute_id, 'albumina', 'Albumina', 60),
    (p_tenant_id, v_attribute_id, 'vegetal', 'Proteína vegetal', 70)
  on conflict (attribute_id, code) do nothing;
end;
$$;

-- create_tenant passa a instalar os templates do segmento.
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

  perform private.install_segment_catalog_templates(v_tenant_id, v_segment);

  perform private.log_audit(
    v_tenant_id, 'tenant.created', 'tenant', v_tenant_id::text,
    null, jsonb_build_object('name', v_name, 'slug', v_slug, 'segment', v_segment)
  );

  return v_tenant_id;
end;
$$;

-- Backfill para empresas criadas antes desta migration.
select private.install_segment_catalog_templates(id, segment) from public.tenants;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('catalog.read', 'catalog', 'Consultar produtos, preços e características'),
  ('catalog.write', 'catalog', 'Cadastrar e editar produtos, categorias, marcas, fornecedores e atributos'),
  ('catalog.costs', 'catalog', 'Visualizar e editar custos de produtos'),
  ('inventory.read', 'inventory', 'Consultar estoque, disponibilidade e lotes'),
  ('inventory.entry', 'inventory', 'Registrar entradas de estoque'),
  ('inventory.adjust', 'inventory', 'Registrar ajustes e perdas de estoque'),
  ('inventory.history', 'inventory', 'Consultar histórico de movimentações');

insert into public.role_permissions (role_code, permission_code)
select r.code, p.code
from public.roles r
cross join unnest(array[
  'catalog.read', 'catalog.write', 'catalog.costs',
  'inventory.read', 'inventory.entry', 'inventory.adjust', 'inventory.history'
]) as p(code)
where r.code in ('OWNER', 'ADMIN', 'GERENTE');

insert into public.role_permissions (role_code, permission_code) values
  ('VENDEDOR', 'catalog.read'),
  ('VENDEDOR', 'inventory.read');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.suppliers enable row level security;
alter table public.allergens enable row level security;
alter table public.nutrients enable row level security;
alter table public.product_attributes enable row level security;
alter table public.product_attribute_options enable row level security;

create policy allergens_select on public.allergens for select to authenticated using (true);
create policy nutrients_select on public.nutrients for select to authenticated using (true);

do $$
declare
  v_table text;
begin
  foreach v_table in array array['categories', 'brands', 'suppliers', 'product_attributes', 'product_attribute_options'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (tenant_id in (select private.readable_tenant_ids_with_permission(''catalog.read'')))',
      v_table
    );
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check (tenant_id in (select private.tenant_ids_with_permission(''catalog.write'')))',
      v_table
    );
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using (tenant_id in (select private.tenant_ids_with_permission(''catalog.write'')))
         with check (tenant_id in (select private.tenant_ids_with_permission(''catalog.write'')))',
      v_table
    );
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using (tenant_id in (select private.tenant_ids_with_permission(''catalog.write'')))',
      v_table
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios (tenant_id e chaves nunca são atualizáveis pela API)
-- -----------------------------------------------------------------------------

revoke all on
  public.categories, public.brands, public.suppliers, public.allergens, public.nutrients,
  public.product_attributes, public.product_attribute_options
from anon, authenticated;

grant select on public.allergens, public.nutrients to authenticated;

grant select, insert, delete on
  public.categories, public.brands, public.suppliers,
  public.product_attributes, public.product_attribute_options
to authenticated;

grant update (parent_id, name, description, is_active, sort_order) on public.categories to authenticated;
grant update (name, is_active) on public.brands to authenticated;
grant update (name, legal_name, document, email, phone, contact_name, notes, is_active) on public.suppliers to authenticated;
-- code e data_type são imutáveis: o motor de compatibilidade e os valores dependem deles.
grant update (name, description, unit, group_name, is_searchable, is_filterable, is_compatibility_enabled,
              is_variant_axis, is_active, sort_order)
  on public.product_attributes to authenticated;
grant update (label, sort_order, is_active) on public.product_attribute_options to authenticated;

grant all on
  public.categories, public.brands, public.suppliers, public.allergens, public.nutrients,
  public.product_attributes, public.product_attribute_options
to service_role;

revoke all on all functions in schema private from public, anon;
grant execute on function private.readable_tenant_ids_with_permission(text) to authenticated;
grant execute on function private.search_normalize(text) to authenticated;
