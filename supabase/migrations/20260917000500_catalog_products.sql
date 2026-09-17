-- =============================================================================
-- FASE 2 · Catálogo: produtos, variantes, custos e características
--
-- Decisões:
--   * Todo produto possui ao menos uma variante (a "padrão"). SKU, código de
--     barras e estoque vivem na variante; produto simples = 1 variante.
--   * Custo fica em tabela própria com permissão catalog.costs (vendedor não vê).
--   * Características (atributos, alérgenos, nutrição) existem no nível do
--     produto (variant_id null) e podem ser sobrescritas por variante.
--     Views "effective_*" resolvem variante → produto → desconhecido.
--   * AUSÊNCIA DE REGISTRO = DESCONHECIDO. Nunca significa "não contém"/zero.
--   * Escritas em produtos e características somente via RPC (atômicas e
--     validadas); não há grants de escrita direta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 5000),
  category_id uuid,
  brand_id uuid,
  supplier_id uuid,
  unit text not null default 'UN' check (unit in ('UN', 'KG', 'G', 'L', 'ML', 'CX', 'PCT', 'PAR', 'M')),
  sale_price numeric(12, 2) not null check (sale_price >= 0),
  promo_price numeric(12, 2),
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0),
  image_path text check (image_path is null or char_length(image_path) <= 512),
  is_active boolean not null default true,
  has_variants boolean not null default false,
  track_lots boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_tenant_id_id_key unique (tenant_id, id),
  constraint products_promo_below_price check (promo_price is null or (promo_price >= 0 and promo_price < sale_price)),
  constraint products_category_fkey foreign key (tenant_id, category_id)
    references public.categories (tenant_id, id) on delete set null (category_id),
  constraint products_brand_fkey foreign key (tenant_id, brand_id)
    references public.brands (tenant_id, id) on delete set null (brand_id),
  constraint products_supplier_fkey foreign key (tenant_id, supplier_id)
    references public.suppliers (tenant_id, id) on delete set null (supplier_id)
);

create index products_tenant_active_idx on public.products (tenant_id, is_active) where archived_at is null;
create index products_tenant_category_idx on public.products (tenant_id, category_id);
create index products_tenant_brand_idx on public.products (tenant_id, brand_id);
create index products_tenant_created_idx on public.products (tenant_id, created_at desc);
create index products_name_trgm_idx on public.products using gin (private.search_normalize(name) extensions.gin_trgm_ops);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

create trigger products_audit_update
  after update on public.products
  for each row execute function private.audit_row_update('product', 'tenant_id');

-- -----------------------------------------------------------------------------
-- Variantes
-- -----------------------------------------------------------------------------

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sku text check (sku is null or sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  barcode text check (barcode is null or barcode ~ '^[A-Za-z0-9]{4,64}$'),
  -- null = herda do produto
  sale_price numeric(12, 2) check (sale_price is null or sale_price >= 0),
  promo_price numeric(12, 2) check (promo_price is null or promo_price >= 0),
  min_stock numeric(14, 3) check (min_stock is null or min_stock >= 0),
  image_path text check (image_path is null or char_length(image_path) <= 512),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_tenant_id_id_key unique (tenant_id, id),
  constraint product_variants_tenant_product_id_key unique (tenant_id, product_id, id),
  constraint product_variants_product_fkey foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete cascade,
  constraint product_variants_promo_below_price
    check (promo_price is null or sale_price is null or promo_price < sale_price),
  constraint product_variants_default_not_archived check (not (is_default and archived_at is not null))
);

create unique index product_variants_sku_unique
  on public.product_variants (tenant_id, upper(sku)) where sku is not null and archived_at is null;
create unique index product_variants_barcode_unique
  on public.product_variants (tenant_id, barcode) where barcode is not null and archived_at is null;
create unique index product_variants_one_default on public.product_variants (product_id) where is_default;
create unique index product_variants_name_unique
  on public.product_variants (product_id, lower(btrim(name))) where archived_at is null;
create index product_variants_product_idx on public.product_variants (tenant_id, product_id);

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function private.set_updated_at();

create trigger product_variants_audit_update
  after update on public.product_variants
  for each row execute function private.audit_row_update('product_variant', 'tenant_id');

-- -----------------------------------------------------------------------------
-- Custos (acesso restrito)
-- -----------------------------------------------------------------------------

create table public.product_variant_costs (
  variant_id uuid primary key,
  tenant_id uuid not null,
  cost_price numeric(12, 2) not null check (cost_price >= 0),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint product_variant_costs_variant_fkey foreign key (tenant_id, variant_id)
    references public.product_variants (tenant_id, id) on delete cascade
);

create trigger product_variant_costs_audit_update
  after update on public.product_variant_costs
  for each row execute function private.audit_row_update('product_variant_cost', 'tenant_id', 'variant_id');

-- -----------------------------------------------------------------------------
-- Valores de atributos
-- -----------------------------------------------------------------------------

create table public.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  attribute_id uuid not null,
  value_boolean boolean,
  value_number numeric(14, 4),
  value_text text check (value_text is null or char_length(btrim(value_text)) between 1 and 300),
  option_id uuid,
  source public.info_source not null default 'MANUAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_attribute_values_scope_key unique nulls not distinct (product_id, variant_id, attribute_id),
  constraint product_attribute_values_one_value check (num_nonnulls(value_boolean, value_number, value_text, option_id) = 1),
  constraint product_attribute_values_product_fkey foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete cascade,
  constraint product_attribute_values_variant_fkey foreign key (tenant_id, product_id, variant_id)
    references public.product_variants (tenant_id, product_id, id) on delete cascade,
  constraint product_attribute_values_attribute_fkey foreign key (tenant_id, attribute_id)
    references public.product_attributes (tenant_id, id) on delete restrict,
  constraint product_attribute_values_option_fkey foreign key (tenant_id, option_id)
    references public.product_attribute_options (tenant_id, id) on delete restrict
);

create index product_attribute_values_attribute_idx on public.product_attribute_values (tenant_id, attribute_id);

create or replace function private.attribute_values_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type public.attribute_data_type;
begin
  select a.data_type into v_type from public.product_attributes a where a.id = new.attribute_id;

  if (v_type = 'BOOLEAN' and new.value_boolean is null)
     or (v_type = 'NUMBER' and new.value_number is null)
     or (v_type = 'TEXT' and new.value_text is null)
     or (v_type = 'ENUM' and new.option_id is null) then
    raise exception 'invalid_attribute_value' using errcode = '23514', detail = v_type::text;
  end if;

  if new.option_id is not null and not exists (
    select 1 from public.product_attribute_options o
    where o.id = new.option_id and o.attribute_id = new.attribute_id
  ) then
    raise exception 'invalid_attribute_value' using errcode = '23514', detail = 'option_attribute_mismatch';
  end if;

  return new;
end;
$$;

create trigger product_attribute_values_validate
  before insert or update on public.product_attribute_values
  for each row execute function private.attribute_values_validate();

create trigger product_attribute_values_set_updated_at
  before update on public.product_attribute_values
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Alérgenos (TRUE = contém · FALSE = não contém · UNKNOWN = não informado)
-- -----------------------------------------------------------------------------

create table public.product_allergens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  allergen_code text not null references public.allergens (code),
  presence public.tri_state not null,
  -- "pode conter traços" (rotulagem de contaminação cruzada)
  may_contain_traces boolean not null default false,
  source public.info_source not null,
  notes text check (notes is null or char_length(notes) <= 300),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_allergens_scope_key unique nulls not distinct (product_id, variant_id, allergen_code),
  constraint product_allergens_traces_only_when_absent check (not may_contain_traces or presence = 'FALSE'),
  constraint product_allergens_product_fkey foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete cascade,
  constraint product_allergens_variant_fkey foreign key (tenant_id, product_id, variant_id)
    references public.product_variants (tenant_id, product_id, id) on delete cascade
);

create index product_allergens_lookup_idx on public.product_allergens (tenant_id, allergen_code, presence);

create trigger product_allergens_set_updated_at
  before update on public.product_allergens
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Informação nutricional (valores por porção)
-- -----------------------------------------------------------------------------

create table public.product_nutrition (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  serving_size numeric(10, 2) not null check (serving_size > 0),
  serving_unit text not null check (serving_unit in ('g', 'ml', 'un')),
  serving_description text check (serving_description is null or char_length(serving_description) <= 80),
  servings_per_container numeric(10, 2) check (servings_per_container is null or servings_per_container > 0),
  source public.info_source not null,
  source_notes text check (source_notes is null or char_length(source_notes) <= 300),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_nutrition_tenant_id_id_key unique (tenant_id, id),
  constraint product_nutrition_scope_key unique nulls not distinct (product_id, variant_id),
  constraint product_nutrition_product_fkey foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete cascade,
  constraint product_nutrition_variant_fkey foreign key (tenant_id, product_id, variant_id)
    references public.product_variants (tenant_id, product_id, id) on delete cascade
);

create trigger product_nutrition_set_updated_at
  before update on public.product_nutrition
  for each row execute function private.set_updated_at();

create table public.product_nutrition_values (
  nutrition_id uuid not null,
  tenant_id uuid not null,
  nutrient_code text not null references public.nutrients (code),
  amount numeric(12, 3) not null check (amount >= 0),
  primary key (nutrition_id, nutrient_code),
  constraint product_nutrition_values_nutrition_fkey foreign key (tenant_id, nutrition_id)
    references public.product_nutrition (tenant_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Helpers internos
-- -----------------------------------------------------------------------------

create or replace function private.raise_catalog_unique_violation(p_constraint text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%',
    case
      when p_constraint like '%sku%' then 'sku_taken'
      when p_constraint like '%barcode%' then 'barcode_taken'
      else 'name_taken'
    end
    using errcode = '23505';
end;
$$;

-- Carrega o produto (com lock opcional) validando permissão no tenant dele.
create or replace function private.load_product_for_write(p_product_id uuid, p_permission text default 'catalog.write')
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  perform private.require_user();
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_product.tenant_id, p_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_product;
end;
$$;

create or replace function private.assert_same_tenant_refs(
  p_tenant_id uuid,
  p_category_id uuid,
  p_brand_id uuid,
  p_supplier_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- As FKs compostas já garantem isso; checagem antecipada gera erro amigável.
  if (p_category_id is not null and not exists (select 1 from public.categories where id = p_category_id and tenant_id = p_tenant_id))
     or (p_brand_id is not null and not exists (select 1 from public.brands where id = p_brand_id and tenant_id = p_tenant_id))
     or (p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id and tenant_id = p_tenant_id)) then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;
end;
$$;

create or replace function private.upsert_variant_cost(p_tenant_id uuid, p_variant_id uuid, p_cost numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_tenant_permission(p_tenant_id, 'catalog.costs') then
    raise exception 'forbidden' using errcode = '42501', detail = 'catalog.costs';
  end if;

  if p_cost is null then
    delete from public.product_variant_costs where variant_id = p_variant_id;
  else
    insert into public.product_variant_costs (variant_id, tenant_id, cost_price, updated_by)
    values (p_variant_id, p_tenant_id, p_cost, (select auth.uid()))
    on conflict (variant_id) do update
      set cost_price = excluded.cost_price, updated_by = excluded.updated_by, updated_at = now()
      where public.product_variant_costs.cost_price is distinct from excluded.cost_price;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs de produto
-- -----------------------------------------------------------------------------

create or replace function public.catalog_create_product(
  p_tenant_id uuid,
  p_name text,
  p_sale_price numeric,
  p_description text default null,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_supplier_id uuid default null,
  p_unit text default 'UN',
  p_promo_price numeric default null,
  p_min_stock numeric default 0,
  p_is_active boolean default true,
  p_track_lots boolean default false,
  p_sku text default null,
  p_barcode text default null,
  p_cost_price numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_product_id uuid;
  v_variant_id uuid;
  v_constraint text;
begin
  if not private.has_tenant_permission(p_tenant_id, 'catalog.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.assert_same_tenant_refs(p_tenant_id, p_category_id, p_brand_id, p_supplier_id);

  begin
    insert into public.products (
      tenant_id, name, description, category_id, brand_id, supplier_id, unit,
      sale_price, promo_price, min_stock, is_active, track_lots, created_by
    ) values (
      p_tenant_id, btrim(p_name), nullif(btrim(p_description), ''), p_category_id, p_brand_id, p_supplier_id,
      coalesce(p_unit, 'UN'), p_sale_price, p_promo_price, coalesce(p_min_stock, 0),
      coalesce(p_is_active, true), coalesce(p_track_lots, false), v_uid
    )
    returning id into v_product_id;

    insert into public.product_variants (tenant_id, product_id, name, sku, barcode, is_default)
    values (p_tenant_id, v_product_id, 'Padrão', nullif(btrim(p_sku), ''), nullif(btrim(p_barcode), ''), true)
    returning id into v_variant_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform private.raise_catalog_unique_violation(v_constraint);
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'invalid_input' using errcode = '22023', detail = coalesce(v_constraint, '');
  end;

  if p_cost_price is not null then
    perform private.upsert_variant_cost(p_tenant_id, v_variant_id, p_cost_price);
  end if;

  perform private.log_audit(
    p_tenant_id, 'product.created', 'product', v_product_id::text, null,
    jsonb_build_object('name', btrim(p_name), 'sale_price', p_sale_price, 'sku', p_sku)
  );

  return v_product_id;
end;
$$;

create or replace function public.catalog_update_product(
  p_product_id uuid,
  p_name text,
  p_sale_price numeric,
  p_description text default null,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_supplier_id uuid default null,
  p_unit text default 'UN',
  p_promo_price numeric default null,
  p_min_stock numeric default 0,
  p_is_active boolean default true,
  p_track_lots boolean default false,
  -- aplicados à variante padrão somente em produtos simples
  p_sku text default null,
  p_barcode text default null,
  p_cost_price numeric default null,
  p_update_cost boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_default_variant uuid;
  v_constraint text;
begin
  v_product := private.load_product_for_write(p_product_id);

  if v_product.archived_at is not null then
    raise exception 'product_archived' using errcode = 'P0001';
  end if;
  perform private.assert_same_tenant_refs(v_product.tenant_id, p_category_id, p_brand_id, p_supplier_id);

  if coalesce(p_track_lots, false) <> v_product.track_lots and exists (
    select 1 from public.stock_levels s
    where s.product_id = v_product.id and (s.physical_quantity > 0 or s.reserved_quantity > 0)
  ) then
    raise exception 'product_has_stock' using errcode = 'P0001', detail = 'track_lots';
  end if;

  select id into v_default_variant from public.product_variants where product_id = v_product.id and is_default;

  begin
    update public.products set
      name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      category_id = p_category_id,
      brand_id = p_brand_id,
      supplier_id = p_supplier_id,
      unit = coalesce(p_unit, 'UN'),
      sale_price = p_sale_price,
      promo_price = p_promo_price,
      min_stock = coalesce(p_min_stock, 0),
      is_active = coalesce(p_is_active, true),
      track_lots = coalesce(p_track_lots, false)
    where id = v_product.id;

    if not v_product.has_variants then
      update public.product_variants set
        sku = nullif(btrim(p_sku), ''),
        barcode = nullif(btrim(p_barcode), '')
      where id = v_default_variant;
    end if;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform private.raise_catalog_unique_violation(v_constraint);
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'invalid_input' using errcode = '22023', detail = coalesce(v_constraint, '');
  end;

  if p_update_cost and not v_product.has_variants then
    perform private.upsert_variant_cost(v_product.tenant_id, v_default_variant, p_cost_price);
  end if;
end;
$$;

create or replace function public.catalog_set_product_active(p_product_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  v_product := private.load_product_for_write(p_product_id);
  if v_product.archived_at is not null then
    raise exception 'product_archived' using errcode = 'P0001';
  end if;
  update public.products set is_active = coalesce(p_active, false) where id = v_product.id;
end;
$$;

-- Arquivamento (soft delete). Exige estoque zerado para não perder rastreabilidade.
create or replace function public.catalog_archive_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  v_product := private.load_product_for_write(p_product_id);
  if v_product.archived_at is not null then
    return;
  end if;
  if exists (
    select 1 from public.stock_levels s
    where s.product_id = v_product.id and (s.physical_quantity > 0 or s.reserved_quantity > 0)
  ) then
    raise exception 'product_has_stock' using errcode = 'P0001';
  end if;

  update public.product_variants set is_default = false where product_id = v_product.id and is_default;
  update public.product_variants set archived_at = now(), is_active = false
  where product_id = v_product.id and archived_at is null;
  update public.products set archived_at = now(), is_active = false where id = v_product.id;

  perform private.log_audit(v_product.tenant_id, 'product.archived', 'product', v_product.id::text,
    jsonb_build_object('name', v_product.name), null);
end;
$$;

create or replace function public.catalog_set_product_image(p_product_id uuid, p_image_path text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  v_product := private.load_product_for_write(p_product_id);
  if p_image_path is not null
     and p_image_path !~ ('^' || v_product.tenant_id::text || '/products/' || v_product.id::text || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'image_path';
  end if;
  update public.products set image_path = p_image_path where id = v_product.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs de variantes
-- -----------------------------------------------------------------------------

create or replace function public.catalog_upsert_variant(
  p_product_id uuid,
  p_name text,
  p_variant_id uuid default null,
  p_sku text default null,
  p_barcode text default null,
  p_sale_price numeric default null,
  p_promo_price numeric default null,
  p_min_stock numeric default null,
  p_is_active boolean default true,
  p_cost_price numeric default null,
  p_update_cost boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_variant public.product_variants;
  v_variant_id uuid;
  v_effective_price numeric := coalesce(p_sale_price, 0);
  v_constraint text;
begin
  v_product := private.load_product_for_write(p_product_id);
  if v_product.archived_at is not null then
    raise exception 'product_archived' using errcode = 'P0001';
  end if;

  v_effective_price := coalesce(p_sale_price, v_product.sale_price);
  if p_promo_price is not null and p_promo_price >= v_effective_price then
    raise exception 'invalid_input' using errcode = '22023', detail = 'promo_price';
  end if;

  begin
    if p_variant_id is null then
      insert into public.product_variants (
        tenant_id, product_id, name, sku, barcode, sale_price, promo_price, min_stock, is_active, sort_order
      ) values (
        v_product.tenant_id, v_product.id, btrim(p_name), nullif(btrim(p_sku), ''), nullif(btrim(p_barcode), ''),
        p_sale_price, p_promo_price, p_min_stock, coalesce(p_is_active, true),
        (select coalesce(max(sort_order), 0) + 10 from public.product_variants where product_id = v_product.id)
      )
      returning id into v_variant_id;

      if not v_product.has_variants then
        update public.products set has_variants = true where id = v_product.id;
      end if;

      perform private.log_audit(v_product.tenant_id, 'product_variant.created', 'product_variant', v_variant_id::text,
        null, jsonb_build_object('product_id', v_product.id, 'name', btrim(p_name), 'sku', p_sku));
    else
      select * into v_variant from public.product_variants
      where id = p_variant_id and product_id = v_product.id for update;
      if not found then
        raise exception 'not_found' using errcode = 'P0002';
      end if;
      if v_variant.archived_at is not null then
        raise exception 'product_archived' using errcode = 'P0001';
      end if;
      if v_variant.is_default and not coalesce(p_is_active, true) and not exists (
        select 1 from public.product_variants
        where product_id = v_product.id and id <> v_variant.id and archived_at is null and is_active
      ) then
        raise exception 'last_variant' using errcode = 'P0001';
      end if;

      update public.product_variants set
        name = btrim(p_name),
        sku = nullif(btrim(p_sku), ''),
        barcode = nullif(btrim(p_barcode), ''),
        sale_price = p_sale_price,
        promo_price = p_promo_price,
        min_stock = p_min_stock,
        is_active = coalesce(p_is_active, true)
      where id = v_variant.id;
      v_variant_id := v_variant.id;
    end if;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform private.raise_catalog_unique_violation(v_constraint);
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'invalid_input' using errcode = '22023', detail = coalesce(v_constraint, '');
  end;

  if p_update_cost then
    perform private.upsert_variant_cost(v_product.tenant_id, v_variant_id, p_cost_price);
  end if;

  return v_variant_id;
end;
$$;

create or replace function public.catalog_archive_variant(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.product_variants;
  v_product public.products;
  v_next uuid;
begin
  select * into v_variant from public.product_variants where id = p_variant_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_product := private.load_product_for_write(v_variant.product_id);

  select * into v_variant from public.product_variants where id = p_variant_id for update;
  if v_variant.archived_at is not null then
    return;
  end if;

  if exists (
    select 1 from public.stock_levels s
    where s.variant_id = v_variant.id and (s.physical_quantity > 0 or s.reserved_quantity > 0)
  ) then
    raise exception 'product_has_stock' using errcode = 'P0001';
  end if;

  select id into v_next from public.product_variants
  where product_id = v_product.id and id <> v_variant.id and archived_at is null
  order by is_active desc, sort_order, created_at
  limit 1;

  if v_next is null then
    raise exception 'last_variant' using errcode = 'P0001';
  end if;

  if v_variant.is_default then
    update public.product_variants set is_default = false where id = v_variant.id;
    update public.product_variants set is_default = true where id = v_next;
  end if;

  update public.product_variants set archived_at = now(), is_active = false where id = v_variant.id;

  perform private.log_audit(v_product.tenant_id, 'product_variant.archived', 'product_variant', v_variant.id::text,
    jsonb_build_object('name', v_variant.name, 'sku', v_variant.sku), null);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs de características (substituem o conjunto do escopo produto/variante)
-- -----------------------------------------------------------------------------

create or replace function private.assert_variant_scope(p_product public.products, p_variant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_variant_id is not null and not exists (
    select 1 from public.product_variants
    where id = p_variant_id and product_id = p_product.id and archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'variant';
  end if;
end;
$$;

-- p_values: [{ "attribute_id": uuid, "value": boolean|number|string (option_id para ENUM) }]
create or replace function public.catalog_set_attribute_values(
  p_product_id uuid,
  p_values jsonb,
  p_variant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_item jsonb;
  v_attribute public.product_attributes;
  v_value jsonb;
  v_before jsonb;
  v_after jsonb;
begin
  v_product := private.load_product_for_write(p_product_id);
  perform private.assert_variant_scope(v_product, p_variant_id);

  if jsonb_typeof(coalesce(p_values, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'values';
  end if;

  select coalesce(jsonb_agg(to_jsonb(v) - 'created_at' - 'updated_at' order by v.attribute_id), '[]'::jsonb)
  into v_before
  from public.product_attribute_values v
  where v.product_id = v_product.id and v.variant_id is not distinct from p_variant_id;

  delete from public.product_attribute_values
  where product_id = v_product.id and variant_id is not distinct from p_variant_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) loop
    v_value := v_item -> 'value';
    continue when v_value is null or jsonb_typeof(v_value) = 'null';

    begin
      select * into v_attribute from public.product_attributes
      where id = (v_item ->> 'attribute_id')::uuid and tenant_id = v_product.tenant_id;
      if not found then
        raise exception 'invalid_attribute_value' using errcode = '23514', detail = 'attribute';
      end if;

      insert into public.product_attribute_values (
        tenant_id, product_id, variant_id, attribute_id, value_boolean, value_number, value_text, option_id
      ) values (
        v_product.tenant_id, v_product.id, p_variant_id, v_attribute.id,
        case when v_attribute.data_type = 'BOOLEAN' then (v_value #>> '{}')::boolean end,
        case when v_attribute.data_type = 'NUMBER' then (v_value #>> '{}')::numeric end,
        case when v_attribute.data_type = 'TEXT' then nullif(btrim(v_value #>> '{}'), '') end,
        case when v_attribute.data_type = 'ENUM' then (v_value #>> '{}')::uuid end
      );
    exception
      when invalid_text_representation or numeric_value_out_of_range or check_violation or foreign_key_violation then
        raise exception 'invalid_attribute_value' using errcode = '23514', detail = coalesce(v_item ->> 'attribute_id', '');
    end;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(v) - 'created_at' - 'updated_at' order by v.attribute_id), '[]'::jsonb)
  into v_after
  from public.product_attribute_values v
  where v.product_id = v_product.id and v.variant_id is not distinct from p_variant_id;

  if v_before is distinct from v_after then
    perform private.log_audit(v_product.tenant_id, 'product.attributes_updated', 'product', v_product.id::text,
      v_before, v_after, jsonb_build_object('variant_id', p_variant_id));
  end if;
end;
$$;

-- p_allergens: [{ "code", "presence": TRUE|FALSE|UNKNOWN, "may_contain_traces", "source", "notes" }]
-- Itens UNKNOWN sem observação são removidos (ausência = não informado).
create or replace function public.catalog_set_allergens(
  p_product_id uuid,
  p_allergens jsonb,
  p_variant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_item jsonb;
  v_presence public.tri_state;
  v_notes text;
  v_before jsonb;
  v_after jsonb;
begin
  v_product := private.load_product_for_write(p_product_id);
  perform private.assert_variant_scope(v_product, p_variant_id);

  if jsonb_typeof(coalesce(p_allergens, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'allergens';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('code', a.allergen_code, 'presence', a.presence,
           'may_contain_traces', a.may_contain_traces, 'source', a.source, 'notes', a.notes) order by a.allergen_code), '[]'::jsonb)
  into v_before
  from public.product_allergens a
  where a.product_id = v_product.id and a.variant_id is not distinct from p_variant_id;

  delete from public.product_allergens
  where product_id = v_product.id and variant_id is not distinct from p_variant_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_allergens, '[]'::jsonb)) loop
    begin
      v_presence := coalesce(v_item ->> 'presence', 'UNKNOWN')::public.tri_state;
      v_notes := nullif(btrim(v_item ->> 'notes'), '');
      continue when v_presence = 'UNKNOWN' and v_notes is null;

      insert into public.product_allergens (
        tenant_id, product_id, variant_id, allergen_code, presence, may_contain_traces, source, notes, updated_by
      ) values (
        v_product.tenant_id, v_product.id, p_variant_id, v_item ->> 'code', v_presence,
        coalesce((v_item ->> 'may_contain_traces')::boolean, false),
        (v_item ->> 'source')::public.info_source, v_notes, (select auth.uid())
      );
    exception
      when invalid_text_representation or check_violation or not_null_violation
        or foreign_key_violation or unique_violation then
        raise exception 'invalid_input' using errcode = '22023', detail = coalesce(v_item ->> 'code', 'allergen');
    end;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('code', a.allergen_code, 'presence', a.presence,
           'may_contain_traces', a.may_contain_traces, 'source', a.source, 'notes', a.notes) order by a.allergen_code), '[]'::jsonb)
  into v_after
  from public.product_allergens a
  where a.product_id = v_product.id and a.variant_id is not distinct from p_variant_id;

  if v_before is distinct from v_after then
    perform private.log_audit(v_product.tenant_id, 'product.allergens_updated', 'product', v_product.id::text,
      v_before, v_after, jsonb_build_object('variant_id', p_variant_id));
  end if;
end;
$$;

-- p_nutrition: null remove o registro (informação desconhecida) ou
-- { serving_size, serving_unit, serving_description, servings_per_container, source, source_notes,
--   values: { <nutrient_code>: amount } }  — nutriente ausente = desconhecido (nunca zero).
create or replace function public.catalog_set_nutrition(
  p_product_id uuid,
  p_nutrition jsonb,
  p_variant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_nutrition_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_code text;
  v_amount jsonb;
begin
  v_product := private.load_product_for_write(p_product_id);
  perform private.assert_variant_scope(v_product, p_variant_id);

  select to_jsonb(n) - 'id' - 'created_at' - 'updated_at' || jsonb_build_object('values',
           (select coalesce(jsonb_object_agg(nv.nutrient_code, nv.amount), '{}'::jsonb)
            from public.product_nutrition_values nv where nv.nutrition_id = n.id))
  into v_before
  from public.product_nutrition n
  where n.product_id = v_product.id and n.variant_id is not distinct from p_variant_id;

  delete from public.product_nutrition
  where product_id = v_product.id and variant_id is not distinct from p_variant_id;

  if p_nutrition is not null and jsonb_typeof(p_nutrition) = 'object' then
    begin
      insert into public.product_nutrition (
        tenant_id, product_id, variant_id, serving_size, serving_unit, serving_description,
        servings_per_container, source, source_notes, updated_by
      ) values (
        v_product.tenant_id, v_product.id, p_variant_id,
        (p_nutrition ->> 'serving_size')::numeric,
        p_nutrition ->> 'serving_unit',
        nullif(btrim(p_nutrition ->> 'serving_description'), ''),
        (p_nutrition ->> 'servings_per_container')::numeric,
        (p_nutrition ->> 'source')::public.info_source,
        nullif(btrim(p_nutrition ->> 'source_notes'), ''),
        (select auth.uid())
      )
      returning id into v_nutrition_id;

      for v_code, v_amount in select * from jsonb_each(coalesce(p_nutrition -> 'values', '{}'::jsonb)) loop
        continue when v_amount is null or jsonb_typeof(v_amount) = 'null';
        insert into public.product_nutrition_values (nutrition_id, tenant_id, nutrient_code, amount)
        values (v_nutrition_id, v_product.tenant_id, v_code, (v_amount #>> '{}')::numeric);
      end loop;
    exception
      when invalid_text_representation or check_violation or not_null_violation
        or foreign_key_violation or numeric_value_out_of_range then
        raise exception 'invalid_input' using errcode = '22023', detail = 'nutrition';
    end;
  elsif p_nutrition is not null and jsonb_typeof(p_nutrition) <> 'null' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'nutrition';
  end if;

  select to_jsonb(n) - 'id' - 'created_at' - 'updated_at' || jsonb_build_object('values',
           (select coalesce(jsonb_object_agg(nv.nutrient_code, nv.amount), '{}'::jsonb)
            from public.product_nutrition_values nv where nv.nutrition_id = n.id))
  into v_after
  from public.product_nutrition n
  where n.product_id = v_product.id and n.variant_id is not distinct from p_variant_id;

  if v_before is distinct from v_after then
    perform private.log_audit(v_product.tenant_id, 'product.nutrition_updated', 'product', v_product.id::text,
      v_before, v_after, jsonb_build_object('variant_id', p_variant_id));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_costs enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.product_allergens enable row level security;
alter table public.product_nutrition enable row level security;
alter table public.product_nutrition_values enable row level security;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['products', 'product_variants', 'product_attribute_values',
                                 'product_allergens', 'product_nutrition', 'product_nutrition_values'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (tenant_id in (select private.readable_tenant_ids_with_permission(''catalog.read'')))',
      v_table
    );
  end loop;
end;
$$;

create policy product_variant_costs_select on public.product_variant_costs
  for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('catalog.costs')));

revoke all on
  public.products, public.product_variants, public.product_variant_costs, public.product_attribute_values,
  public.product_allergens, public.product_nutrition, public.product_nutrition_values
from anon, authenticated;

grant select on
  public.products, public.product_variants, public.product_variant_costs, public.product_attribute_values,
  public.product_allergens, public.product_nutrition, public.product_nutrition_values
to authenticated;

grant all on
  public.products, public.product_variants, public.product_variant_costs, public.product_attribute_values,
  public.product_allergens, public.product_nutrition, public.product_nutrition_values
to service_role;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.catalog_create_product(uuid, text, numeric, text, uuid, uuid, uuid, text, numeric, numeric, boolean, boolean, text, text, numeric),
  public.catalog_update_product(uuid, text, numeric, text, uuid, uuid, uuid, text, numeric, numeric, boolean, boolean, text, text, numeric, boolean),
  public.catalog_set_product_active(uuid, boolean),
  public.catalog_archive_product(uuid),
  public.catalog_set_product_image(uuid, text),
  public.catalog_upsert_variant(uuid, text, uuid, text, text, numeric, numeric, numeric, boolean, numeric, boolean),
  public.catalog_archive_variant(uuid),
  public.catalog_set_attribute_values(uuid, jsonb, uuid),
  public.catalog_set_allergens(uuid, jsonb, uuid),
  public.catalog_set_nutrition(uuid, jsonb, uuid)
from public, anon;

grant execute on function
  public.catalog_create_product(uuid, text, numeric, text, uuid, uuid, uuid, text, numeric, numeric, boolean, boolean, text, text, numeric),
  public.catalog_update_product(uuid, text, numeric, text, uuid, uuid, uuid, text, numeric, numeric, boolean, boolean, text, text, numeric, boolean),
  public.catalog_set_product_active(uuid, boolean),
  public.catalog_archive_product(uuid),
  public.catalog_set_product_image(uuid, text),
  public.catalog_upsert_variant(uuid, text, uuid, text, text, numeric, numeric, numeric, boolean, numeric, boolean),
  public.catalog_archive_variant(uuid),
  public.catalog_set_attribute_values(uuid, jsonb, uuid),
  public.catalog_set_allergens(uuid, jsonb, uuid),
  public.catalog_set_nutrition(uuid, jsonb, uuid)
to authenticated, service_role;
