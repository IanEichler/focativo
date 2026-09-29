-- One authenticated round trip for the context used by every search/page.
-- No cross-request cache: membership, permissions and module flags stay current.
create function public.get_my_app_context(p_preferred_tenant uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_memberships jsonb;
  v_active uuid;
  v_profile jsonb;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId', m.id,
    'id', t.id, 'name', t.name, 'slug', t.slug, 'status', t.status,
    'segment', t.segment, 'roleCode', m.role_code, 'roleName', r.name
  ) order by m.created_at, m.id), '[]'::jsonb) into v_memberships
  from public.tenant_users m
  join public.tenants t on t.id = m.tenant_id
  join public.roles r on r.code = m.role_code
  where m.user_id = v_user and m.status = 'ACTIVE';
  if jsonb_array_length(v_memberships) = 0 then return null; end if;
  select (item->>'id')::uuid into v_active from jsonb_array_elements(v_memberships) item
    where (item->>'id')::uuid = p_preferred_tenant;
  v_active := coalesce(v_active, (v_memberships->0->>'id')::uuid);
  select jsonb_build_object('fullName',full_name,'email',email,'avatarUrl',avatar_url,'navOrder',nav_order)
    into v_profile from public.profiles where id = v_user;
  return jsonb_build_object(
    'memberships',v_memberships,'activeId',v_active,'profile',v_profile,
    'permissions',(select coalesce(jsonb_agg(permission), '[]'::jsonb) from public.get_my_permissions(v_active) permission),
    'disabledModules',(select coalesce(jsonb_agg(module_code), '[]'::jsonb)
      from public.tenant_module_flags where tenant_id = v_active and not enabled)
  );
end;
$$;
revoke all on function public.get_my_app_context(uuid) from public, anon;
grant execute on function public.get_my_app_context(uuid) to authenticated;
