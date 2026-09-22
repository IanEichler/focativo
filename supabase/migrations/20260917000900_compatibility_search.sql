-- =============================================================================
-- FASE 3 · ProductCompatibilityEngine, busca estruturada e recomendação
--
-- O motor é determinístico: consome apenas dados estruturados (alérgenos,
-- atributos com is_compatibility_enabled, nutrição, preço, estoque) já
-- resolvidos pelas views efetivas da Fase 2. Nenhuma IA decide compatibilidade;
-- a IA (Fase 7) só vai popular p_requirements a partir da linguagem natural.
--
-- Ausência de informação nunca vira COMPATIBLE nem INCOMPATIBLE: sempre UNKNOWN.
-- Status agregado por variante usa a pior evidência: INCOMPATIBLE > UNKNOWN >
-- COMPATIBLE — nunca afirmamos segurança quando falta dado.
--
-- Formato de um requisito (elemento de p_requirements, um array jsonb):
--   { "level": "PREFERENCE" | "NUTRITIONAL_CHARACTERISTIC" | "HEALTH_RELATED",
--     "type": "ALLERGEN_ABSENT" | "ALLERGEN_PRESENT" | "ATTRIBUTE_EQUALS"
--           | "NUTRITION_MAX" | "NUTRITION_MIN" | "PRICE_MAX",
--     "code": "<allergen_code | attribute_code | nutrient_code>",
--     "value": <texto/número/boolean conforme o tipo> }
-- "level" é só metadado para a UI/IA; não afeta o cálculo de status.
--
-- Estas funções são invoker (não security definer, como catalog_search_products):
-- o RLS das views efetivas já restringe os dados ao tenant/permissão de quem
-- chama, sem precisar duplicar a checagem aqui.
-- =============================================================================

create or replace function private.evaluate_requirement(p_variant_id uuid, p_requirement jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_type text := p_requirement ->> 'type';
  v_code text := p_requirement ->> 'code';
  v_status text;
  v_reason text;
  v_presence public.tri_state;
  v_attr record;
  v_nutrient_value numeric;
  v_threshold numeric;
  v_price numeric;
begin
  if v_type in ('ALLERGEN_ABSENT', 'ALLERGEN_PRESENT') then
    select presence into v_presence
    from public.effective_variant_allergens
    where variant_id = p_variant_id and allergen_code = v_code;

    if v_presence is null then
      v_status := 'UNKNOWN'; v_reason := 'allergen_not_cataloged';
    elsif v_presence = 'UNKNOWN' then
      v_status := 'UNKNOWN'; v_reason := 'allergen_not_informed';
    elsif (v_type = 'ALLERGEN_ABSENT' and v_presence = 'FALSE')
       or (v_type = 'ALLERGEN_PRESENT' and v_presence = 'TRUE') then
      v_status := 'COMPATIBLE'; v_reason := 'allergen_matches';
    else
      v_status := 'INCOMPATIBLE'; v_reason := 'allergen_mismatch';
    end if;

  elsif v_type = 'ATTRIBUTE_EQUALS' then
    select a.is_compatibility_enabled, a.option_code, a.value_text, a.value_number, a.value_boolean
    into v_attr
    from public.effective_variant_attributes a
    where a.variant_id = p_variant_id and a.attribute_code = v_code;

    if not found then
      v_status := 'UNKNOWN'; v_reason := 'attribute_not_found';
    elsif not v_attr.is_compatibility_enabled then
      v_status := 'UNKNOWN'; v_reason := 'attribute_not_enabled_for_compatibility';
    elsif v_attr.option_code is null and v_attr.value_text is null
      and v_attr.value_number is null and v_attr.value_boolean is null then
      v_status := 'UNKNOWN'; v_reason := 'attribute_not_informed';
    elsif coalesce(v_attr.option_code, v_attr.value_text, v_attr.value_number::text, v_attr.value_boolean::text)
      = (p_requirement ->> 'value') then
      v_status := 'COMPATIBLE'; v_reason := 'attribute_matches';
    else
      v_status := 'INCOMPATIBLE'; v_reason := 'attribute_mismatch';
    end if;

  elsif v_type in ('NUTRITION_MAX', 'NUTRITION_MIN') then
    select (nutrient_values ->> v_code)::numeric into v_nutrient_value
    from public.effective_variant_nutrition
    where variant_id = p_variant_id;
    v_threshold := (p_requirement ->> 'value')::numeric;

    if v_nutrient_value is null then
      v_status := 'UNKNOWN'; v_reason := 'nutrient_not_informed';
    elsif (v_type = 'NUTRITION_MAX' and v_nutrient_value <= v_threshold)
       or (v_type = 'NUTRITION_MIN' and v_nutrient_value >= v_threshold) then
      v_status := 'COMPATIBLE'; v_reason := 'nutrient_within_range';
    else
      v_status := 'INCOMPATIBLE'; v_reason := 'nutrient_out_of_range';
    end if;

  elsif v_type = 'PRICE_MAX' then
    select current_price into v_price from public.product_variant_details where variant_id = p_variant_id;
    v_threshold := (p_requirement ->> 'value')::numeric;

    if v_price is null then
      v_status := 'UNKNOWN'; v_reason := 'price_not_available';
    elsif v_price <= v_threshold then
      v_status := 'COMPATIBLE'; v_reason := 'price_within_budget';
    else
      v_status := 'INCOMPATIBLE'; v_reason := 'price_above_budget';
    end if;

  else
    raise exception 'invalid_input' using errcode = '22023', detail = 'requirement_type';
  end if;

  return jsonb_build_object('type', v_type, 'code', v_code, 'level', p_requirement -> 'level',
    'status', v_status, 'reason', v_reason);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_input' using errcode = '22023', detail = 'requirement_value';
end;
$$;

-- -----------------------------------------------------------------------------
-- ProductCompatibilityEngine: status por variante para um conjunto de requisitos
-- -----------------------------------------------------------------------------

create or replace function public.catalog_check_compatibility(
  p_tenant_id uuid,
  p_variant_ids uuid[],
  p_requirements jsonb
)
returns table (variant_id uuid, status text, results jsonb)
language plpgsql
stable
set search_path = ''
as $$
begin
  if jsonb_typeof(coalesce(p_requirements, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'requirements';
  end if;

  return query
  select
    pv.id as variant_id,
    case
      when coalesce(bool_or(r.result ->> 'status' = 'INCOMPATIBLE'), false) then 'INCOMPATIBLE'
      when coalesce(bool_or(r.result ->> 'status' = 'UNKNOWN'), false) then 'UNKNOWN'
      else 'COMPATIBLE'
    end as status,
    coalesce(jsonb_agg(r.result order by r.ord) filter (where r.result is not null), '[]'::jsonb) as results
  from public.product_variants pv
  left join lateral (
    select private.evaluate_requirement(pv.id, req.value) as result, req.ordinality as ord
    from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) with ordinality as req (value, ordinality)
  ) r on true
  where pv.tenant_id = p_tenant_id and pv.id = any (p_variant_ids)
  group by pv.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Busca estruturada + recomendação (ranking)
--
-- p_exclude_incompatible = false por padrão: a IA (Fase 7) deve poder explicar
-- objetivamente uma incompatibilidade em vez de simplesmente escondê-la
-- (seção "não desincentivar a venda" do escopo). O vendedor/UI decide se
-- filtra ou apenas ordena por compatibilidade.
-- -----------------------------------------------------------------------------

create or replace function public.catalog_search_variants(
  p_tenant_id uuid,
  p_query text default null,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_in_stock_only boolean default false,
  p_requirements jsonb default '[]'::jsonb,
  p_exclude_incompatible boolean default false,
  p_sort text default 'relevance',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  variant_name text,
  has_variants boolean,
  sku text,
  image_path text,
  category_name text,
  brand_name text,
  unit text,
  current_price numeric,
  available_quantity numeric,
  stock_status text,
  compatibility_status text,
  compatibility_results jsonb,
  matched_preferences integer,
  total_requirements integer,
  total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_requirements jsonb := coalesce(p_requirements, '[]'::jsonb);
begin
  if jsonb_typeof(v_requirements) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'requirements';
  end if;

  return query
  with params as (
    select nullif(
      replace(replace(replace(private.search_normalize(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_'),
      ''
    ) as term
  ),
  base as (
    select
      d.variant_id, d.product_id, p.name as product_name, d.name as variant_name, p.has_variants,
      d.sku, d.image_path, c.name as category_name, b.name as brand_name, p.unit,
      d.current_price, d.available_quantity, d.stock_status
    from public.product_variant_details d
    join public.products p on p.id = d.product_id
    cross join params
    left join public.categories c on c.id = p.category_id
    left join public.brands b on b.id = p.brand_id
    where d.tenant_id = p_tenant_id
      and d.is_active
      and p.archived_at is null
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_brand_id is null or p.brand_id = p_brand_id)
      and (p_price_min is null or d.current_price >= p_price_min)
      and (p_price_max is null or d.current_price <= p_price_max)
      and (not p_in_stock_only or coalesce(d.available_quantity, 0) > 0)
      and (
        params.term is null
        or private.search_normalize(concat_ws(' ', p.name, d.name, d.sku)) like '%' || params.term || '%'
        or private.search_normalize(coalesce(b.name, '')) like '%' || params.term || '%'
      )
  ),
  scored as (
    select
      base.*,
      case
        when coalesce(bool_or(r.result ->> 'status' = 'INCOMPATIBLE'), false) then 'INCOMPATIBLE'
        when coalesce(bool_or(r.result ->> 'status' = 'UNKNOWN'), false) then 'UNKNOWN'
        else 'COMPATIBLE'
      end as compatibility_status,
      coalesce(jsonb_agg(r.result order by r.ord) filter (where r.result is not null), '[]'::jsonb) as compatibility_results,
      count(*) filter (where r.result ->> 'status' = 'COMPATIBLE')::integer as matched_preferences,
      jsonb_array_length(v_requirements) as total_requirements
    from base
    left join lateral (
      select private.evaluate_requirement(base.variant_id, req.value) as result, req.ordinality as ord
      from jsonb_array_elements(v_requirements) with ordinality as req (value, ordinality)
    ) r on true
    group by
      base.variant_id, base.product_id, base.product_name, base.variant_name, base.has_variants,
      base.sku, base.image_path, base.category_name, base.brand_name, base.unit,
      base.current_price, base.available_quantity, base.stock_status
  )
  select s.*, count(*) over () as total_count
  from scored s
  where not p_exclude_incompatible or s.compatibility_status <> 'INCOMPATIBLE'
  order by
    case s.compatibility_status when 'COMPATIBLE' then 0 when 'UNKNOWN' then 1 else 2 end,
    case when p_sort = 'price_asc' then s.current_price end asc nulls last,
    case when p_sort = 'price_desc' then s.current_price end desc nulls last,
    case when p_sort = 'availability' then s.available_quantity end desc nulls last,
    s.matched_preferences desc,
    (s.available_quantity > 0) desc,
    s.current_price asc nulls last,
    s.product_name asc,
    s.variant_id
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------

revoke all on function private.evaluate_requirement(uuid, jsonb) from public, anon;
grant execute on function private.evaluate_requirement(uuid, jsonb) to authenticated, service_role;

revoke execute on function
  public.catalog_check_compatibility(uuid, uuid[], jsonb),
  public.catalog_search_variants(uuid, text, uuid, uuid, numeric, numeric, boolean, jsonb, boolean, text, integer, integer)
from public, anon;

grant execute on function
  public.catalog_check_compatibility(uuid, uuid[], jsonb),
  public.catalog_search_variants(uuid, text, uuid, uuid, numeric, numeric, boolean, jsonb, boolean, text, integer, integer)
to authenticated, service_role;
