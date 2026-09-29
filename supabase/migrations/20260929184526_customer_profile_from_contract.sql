alter table public.customers
  add column rg text check (rg is null or char_length(rg) <= 30),
  add column profession text check (profession is null or char_length(profession) <= 160),
  add column address text check (address is null or char_length(address) <= 500),
  add column city_state text check (city_state is null or char_length(city_state) <= 160),
  add column postal_code text check (postal_code is null or postal_code ~ '^[0-9]{8}$');

grant update (rg, profession, address, city_state, postal_code)
  on public.customers to authenticated;

-- Runs under the caller's RLS. The row lock prevents a concurrent profile edit
-- from being overwritten between the form preview and contract generation.
create function public.customer_fill_missing_from_contract(p_customer_id uuid, p_values jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_customer public.customers;
  v_patch jsonb := '{}'::jsonb;
  v_key text;
  v_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_customer from public.customers
    where id = p_customer_id and archived_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not private.has_tenant_permission(v_customer.tenant_id, 'customers.write')
     or not private.has_tenant_permission(v_customer.tenant_id, 'documents.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  foreach v_key in array array['name','phone','whatsapp','email','document','birthday','rg','profession','address','city_state','postal_code'] loop
    v_value := nullif(btrim(p_values ->> v_key), '');
    if nullif(btrim(to_jsonb(v_customer) ->> v_key), '') is null and v_value is not null then
      v_patch := v_patch || jsonb_build_object(v_key, v_value);
    end if;
  end loop;
  if v_patch = '{}'::jsonb then return 0; end if;

  update public.customers set
    name = coalesce(v_patch->>'name', name),
    phone = coalesce(v_patch->>'phone', phone),
    whatsapp = coalesce(v_patch->>'whatsapp', whatsapp),
    email = coalesce(v_patch->>'email', email),
    document = coalesce(v_patch->>'document', document),
    birthday = coalesce((v_patch->>'birthday')::date, birthday),
    rg = coalesce(v_patch->>'rg', rg),
    profession = coalesce(v_patch->>'profession', profession),
    address = coalesce(v_patch->>'address', address),
    city_state = coalesce(v_patch->>'city_state', city_state),
    postal_code = coalesce(v_patch->>'postal_code', postal_code)
  where id = v_customer.id;
  return (select count(*)::integer from jsonb_object_keys(v_patch));
end;
$$;
revoke all on function public.customer_fill_missing_from_contract(uuid,jsonb) from public, anon;
grant execute on function public.customer_fill_missing_from_contract(uuid,jsonb) to authenticated;
