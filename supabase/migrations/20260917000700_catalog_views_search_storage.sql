-- =============================================================================
-- FASE 2 · Views efetivas, busca de produtos e imagens
--
-- Todas as views usam security_invoker: o RLS das tabelas base é aplicado com a
-- identidade de quem consulta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Variantes com preço, mínimo e estoque efetivos (regra de herança em um só lugar)
-- -----------------------------------------------------------------------------

create view public.product_variant_details
with (security_invoker = true)
as
select
  v.id as variant_id,
  v.tenant_id,
  v.product_id,
  v.name,
  v.sku,
  v.barcode,
  v.is_default,
  (p.is_active and v.is_active) as is_active,
  v.is_active as variant_is_active,
  v.sort_order,
  v.sale_price as own_sale_price,
  v.promo_price as own_promo_price,
  v.min_stock as own_min_stock,
  prices.sale_price as effective_sale_price,
  case when prices.promo_price < prices.sale_price then prices.promo_price end as effective_promo_price,
  coalesce(case when prices.promo_price < prices.sale_price then prices.promo_price end, prices.sale_price) as current_price,
  coalesce(v.min_stock, p.min_stock) as effective_min_stock,
  coalesce(v.image_path, p.image_path) as image_path,
  s.physical_quantity,
  s.reserved_quantity,
  s.available_quantity,
  case
    when s.variant_id is null then null
    when s.available_quantity <= 0 then 'OUT'
    when coalesce(v.min_stock, p.min_stock) > 0 and s.available_quantity <= coalesce(v.min_stock, p.min_stock) then 'LOW'
    else 'OK'
  end as stock_status,
  v.created_at,
  v.updated_at
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.stock_levels s on s.variant_id = v.id
cross join lateral (
  select
    coalesce(v.sale_price, p.sale_price) as sale_price,
    -- variante com preço próprio não herda a promoção do produto
    case when v.sale_price is not null then v.promo_price else coalesce(v.promo_price, p.promo_price) end as promo_price
) prices
where v.archived_at is null;

-- -----------------------------------------------------------------------------
-- Características efetivas por variante
-- -----------------------------------------------------------------------------

create view public.effective_variant_allergens
with (security_invoker = true)
as
select
  v.tenant_id,
  v.product_id,
  v.id as variant_id,
  a.code as allergen_code,
  a.name as allergen_name,
  a.sort_order,
  coalesce(ea.presence, 'UNKNOWN'::public.tri_state) as presence,
  coalesce(ea.may_contain_traces, false) as may_contain_traces,
  ea.source,
  ea.notes,
  case
    when ea.variant_id is not null then 'VARIANT'
    when ea.id is not null then 'PRODUCT'
    else 'NONE'
  end as defined_at
from public.product_variants v
cross join public.allergens a
left join lateral (
  select x.*
  from public.product_allergens x
  where x.product_id = v.product_id
    and x.allergen_code = a.code
    and (x.variant_id = v.id or x.variant_id is null)
  order by x.variant_id nulls last
  limit 1
) ea on true
where v.archived_at is null;

create view public.effective_variant_attributes
with (security_invoker = true)
as
select
  v.tenant_id,
  v.product_id,
  v.id as variant_id,
  a.id as attribute_id,
  a.code as attribute_code,
  a.name as attribute_name,
  a.data_type,
  a.unit,
  a.group_name,
  a.is_searchable,
  a.is_filterable,
  a.is_compatibility_enabled,
  a.sort_order,
  ev.value_boolean,
  ev.value_number,
  ev.value_text,
  ev.option_id,
  o.code as option_code,
  o.label as option_label,
  ev.source,
  case when ev.variant_id is not null then 'VARIANT' else 'PRODUCT' end as defined_at
from public.product_variants v
join public.product_attributes a on a.tenant_id = v.tenant_id
join lateral (
  select x.*
  from public.product_attribute_values x
  where x.product_id = v.product_id
    and x.attribute_id = a.id
    and (x.variant_id = v.id or x.variant_id is null)
  order by x.variant_id nulls last
  limit 1
) ev on true
left join public.product_attribute_options o on o.id = ev.option_id
where v.archived_at is null and a.is_active;

create view public.effective_variant_nutrition
with (security_invoker = true)
as
select
  v.tenant_id,
  v.product_id,
  v.id as variant_id,
  n.id as nutrition_id,
  n.serving_size,
  n.serving_unit,
  n.serving_description,
  n.servings_per_container,
  n.source,
  n.source_notes,
  case when n.variant_id is not null then 'VARIANT' else 'PRODUCT' end as defined_at,
  coalesce(
    (select jsonb_object_agg(nv.nutrient_code, nv.amount)
     from public.product_nutrition_values nv where nv.nutrition_id = n.id),
    '{}'::jsonb
  ) as nutrient_values
from public.product_variants v
join lateral (
  select x.*
  from public.product_nutrition x
  where x.product_id = v.product_id and (x.variant_id = v.id or x.variant_id is null)
  order by x.variant_id nulls last
  limit 1
) n on true
where v.archived_at is null;

-- -----------------------------------------------------------------------------
-- Busca de produtos (lista administrativa)
-- -----------------------------------------------------------------------------

create or replace function public.catalog_search_products(
  p_tenant_id uuid,
  p_query text default null,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_status text default 'active',
  p_stock_status text default null,
  p_sort text default 'name',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  image_path text,
  category_id uuid,
  category_name text,
  brand_id uuid,
  brand_name text,
  unit text,
  is_active boolean,
  has_variants boolean,
  track_lots boolean,
  variant_count bigint,
  sku text,
  barcode text,
  min_price numeric,
  max_price numeric,
  sale_price numeric,
  promo_price numeric,
  physical_quantity numeric,
  reserved_quantity numeric,
  available_quantity numeric,
  stock_status text,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with recursive category_tree as (
    select c.id
    from public.categories c
    where p_category_id is not null and c.id = p_category_id and c.tenant_id = p_tenant_id
    union all
    select c.id from public.categories c join category_tree t on c.parent_id = t.id
  ),
  params as (
    select
      nullif(
        replace(replace(replace(private.search_normalize(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_'),
        ''
      ) as term
  ),
  matched as (
    select
      p.id,
      p.name,
      p.image_path,
      p.category_id,
      c.name as category_name,
      p.brand_id,
      b.name as brand_name,
      p.unit,
      p.is_active,
      p.has_variants,
      p.track_lots,
      agg.variant_count,
      agg.sku,
      agg.barcode,
      agg.min_price,
      agg.max_price,
      agg.sale_price,
      agg.promo_price,
      agg.physical_quantity,
      agg.reserved_quantity,
      agg.available_quantity,
      case
        when agg.available_quantity is null then null
        when coalesce(agg.available_quantity, 0) <= 0 then 'OUT'
        when agg.has_low then 'LOW'
        else 'OK'
      end as stock_status,
      p.updated_at
    from public.products p
    cross join params
    left join public.categories c on c.id = p.category_id
    left join public.brands b on b.id = p.brand_id
    join lateral (
      select
        count(*) as variant_count,
        max(d.sku) filter (where d.is_default) as sku,
        max(d.barcode) filter (where d.is_default) as barcode,
        min(d.current_price) as min_price,
        max(d.current_price) as max_price,
        max(d.effective_sale_price) filter (where d.is_default) as sale_price,
        max(d.effective_promo_price) filter (where d.is_default) as promo_price,
        sum(d.physical_quantity) as physical_quantity,
        sum(d.reserved_quantity) as reserved_quantity,
        sum(d.available_quantity) filter (where d.variant_is_active) as available_quantity,
        bool_or(d.stock_status = 'LOW' and d.variant_is_active) as has_low,
        bool_or(
          params.term is not null
          and private.search_normalize(concat_ws(' ', d.name, d.sku, d.barcode)) like '%' || params.term || '%'
        ) as variant_match
      from public.product_variant_details d
      where d.product_id = p.id
    ) agg on true
    where p.tenant_id = p_tenant_id
      and p.archived_at is null
      and (
        coalesce(p_status, 'active') = 'all'
        or (p_status = 'active' and p.is_active)
        or (p_status = 'inactive' and not p.is_active)
      )
      and (p_category_id is null or p.category_id in (select t.id from category_tree t))
      and (p_brand_id is null or p.brand_id = p_brand_id)
      and (
        params.term is null
        or private.search_normalize(p.name) like '%' || params.term || '%'
        or private.search_normalize(coalesce(b.name, '')) like '%' || params.term || '%'
        or agg.variant_match
      )
  )
  select r.*, count(*) over () as total_count
  from matched r
  where p_stock_status is null or r.stock_status = p_stock_status
  order by
    case when p_sort = 'price_asc' then r.min_price end asc nulls last,
    case when p_sort = 'price_desc' then r.max_price end desc nulls last,
    case when p_sort = 'stock' then r.available_quantity end asc nulls last,
    case when p_sort = 'recent' then r.updated_at end desc nulls last,
    r.name asc,
    r.id
  limit least(greatest(coalesce(p_limit, 25), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Sugestões rápidas de variantes (seletor em formulários de estoque).
create or replace function public.catalog_lookup_variants(
  p_tenant_id uuid,
  p_query text default null,
  p_limit integer default 20
)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  variant_name text,
  has_variants boolean,
  sku text,
  barcode text,
  unit text,
  track_lots boolean,
  physical_quantity numeric,
  available_quantity numeric,
  image_path text
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select nullif(
      replace(replace(replace(private.search_normalize(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_'),
      ''
    ) as term,
    btrim(coalesce(p_query, '')) as raw
  )
  select
    d.variant_id, d.product_id, p.name, d.name, p.has_variants, d.sku, d.barcode, p.unit, p.track_lots,
    d.physical_quantity, d.available_quantity, d.image_path
  from public.product_variant_details d
  join public.products p on p.id = d.product_id
  cross join params
  where d.tenant_id = p_tenant_id
    and p.archived_at is null
    and (
      params.term is null
      or private.search_normalize(concat_ws(' ', p.name, d.name, d.sku, d.barcode)) like '%' || params.term || '%'
    )
  order by
    (d.barcode = params.raw or upper(d.sku) = upper(params.raw)) desc nulls last,
    p.name, d.sort_order, d.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- -----------------------------------------------------------------------------
-- Integridade de preço: produto não pode ficar abaixo de promoções herdadas
-- -----------------------------------------------------------------------------

create or replace function private.products_validate_variant_promos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.product_variants v
    where v.product_id = new.id and v.archived_at is null
      and v.sale_price is null and v.promo_price is not null and v.promo_price >= new.sale_price
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'variant_promo_price';
  end if;
  return new;
end;
$$;

create trigger products_validate_variant_promos
  after update of sale_price on public.products
  for each row execute function private.products_validate_variant_promos();

-- -----------------------------------------------------------------------------
-- Imagens de produtos (Supabase Storage)
-- Caminho obrigatório: <tenant_id>/products/<product_id>/<arquivo>
-- Bucket público para leitura (imagens de catálogo são enviadas a clientes);
-- escrita restrita a quem tem catalog.write no tenant da pasta.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (
      select t::text from private.readable_tenant_ids_with_permission('catalog.read') t
    )
  );

create policy product_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[2] = 'products'
    and (storage.foldername(name))[1] in (
      select t::text from private.tenant_ids_with_permission('catalog.write') t
    )
  );

create policy product_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (select t::text from private.tenant_ids_with_permission('catalog.write') t)
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (select t::text from private.tenant_ids_with_permission('catalog.write') t)
  );

create policy product_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (select t::text from private.tenant_ids_with_permission('catalog.write') t)
  );

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------

revoke all on
  public.product_variant_details, public.effective_variant_allergens,
  public.effective_variant_attributes, public.effective_variant_nutrition
from anon, authenticated;

grant select on
  public.product_variant_details, public.effective_variant_allergens,
  public.effective_variant_attributes, public.effective_variant_nutrition
to authenticated, service_role;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.catalog_search_products(uuid, text, uuid, uuid, text, text, text, integer, integer),
  public.catalog_lookup_variants(uuid, text, integer)
from public, anon;

grant execute on function
  public.catalog_search_products(uuid, text, uuid, uuid, text, text, text, integer, integer),
  public.catalog_lookup_variants(uuid, text, integer)
to authenticated, service_role;
