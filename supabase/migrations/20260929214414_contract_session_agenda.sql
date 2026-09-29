-- Freeze the scheduling instructions with the reviewed contract; old contracts keep an empty plan.
alter table public.contract_signatures add column session_plan jsonb not null default '[]'::jsonb
  check (jsonb_typeof(session_plan) = 'array' and jsonb_array_length(session_plan) <= 100);
create function private.protect_contract_session_plan() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.session_plan is distinct from old.session_plan then raise exception 'signature_snapshot_immutable'; end if;
  return new;
end $$;
create trigger protect_contract_session_plan before update on public.contract_signatures
for each row execute function private.protect_contract_session_plan();

create table public.contract_session_appointments (
  id uuid primary key default gen_random_uuid(),
  signature_id uuid not null references public.contract_signatures(id),
  tenant_id uuid not null references public.tenants(id),
  customer_id uuid not null references public.customers(id),
  session_number integer not null check(session_number between 1 and 100),
  service_id uuid not null references public.agenda_services(id),
  professional_user_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at > starts_at),
  notes text not null default '',
  appointment_id uuid references public.agenda_appointments(id),
  error_code text,
  created_at timestamptz not null default now(),
  unique(signature_id,session_number)
);
create index contract_session_appointments_pending_idx on public.contract_session_appointments(tenant_id,starts_at) where appointment_id is null;
create index contract_session_appointments_customer_idx on public.contract_session_appointments(customer_id);
create index contract_session_appointments_service_idx on public.contract_session_appointments(service_id);
create index contract_session_appointments_professional_idx on public.contract_session_appointments(professional_user_id);
create index contract_session_appointments_appointment_idx on public.contract_session_appointments(appointment_id);
alter table public.contract_session_appointments enable row level security;
revoke all on public.contract_session_appointments from public,anon,authenticated;
grant select on public.contract_session_appointments to authenticated;
grant select,insert,update on public.contract_session_appointments to service_role;
create policy contract_session_appointments_read on public.contract_session_appointments for select to authenticated
using(tenant_id in(select private.readable_tenant_ids_with_permission('agenda.read')));

-- Shared checks for generation, signing and staff retry. Times are interpreted in the clinic's timezone.
create function private.contract_session_plan_item(p_tenant_id uuid,p_session jsonb,p_check_overlap boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_service public.agenda_services; v_professional uuid; v_start timestamptz; v_end timestamptz; v_timezone text; v_local timestamp;
begin
  if jsonb_typeof(p_session) <> 'object' or coalesce((p_session->>'number')::integer,0) not between 1 and 100
    or coalesce(p_session->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_session->>'time','') !~ '^([01]\d|2[0-3]):[0-5]\d$'
    then raise exception 'invalid_session' using errcode='22023'; end if;
  select * into v_service from public.agenda_services where id=(p_session->>'serviceId')::uuid and tenant_id=p_tenant_id and is_active;
  if not found then raise exception 'service_unavailable' using errcode='22023'; end if;
  v_professional := (p_session->>'professionalId')::uuid;
  if not exists(select 1 from public.tenant_users where tenant_id=p_tenant_id and user_id=v_professional and status='ACTIVE')
    then raise exception 'professional_unavailable' using errcode='22023'; end if;
  perform private.assert_professional_can_perform_service(p_tenant_id,v_service.id,v_professional);
  select timezone into v_timezone from public.tenants where id=p_tenant_id;
  v_local := ((p_session->>'date')||' '||(p_session->>'time'))::timestamp;
  v_start := v_local at time zone coalesce(v_timezone,'America/Sao_Paulo');
  if (v_start at time zone coalesce(v_timezone,'America/Sao_Paulo')) <> v_local then raise exception 'invalid_session_time' using errcode='22023'; end if;
  v_end := v_start + make_interval(mins=>v_service.duration_minutes);
  if v_start <= now() then raise exception 'session_in_past' using errcode='22023'; end if;
  perform private.assert_within_business_hours(p_tenant_id,v_start,v_end);
  perform private.assert_professional_available(p_tenant_id,v_professional,v_start);
  if p_check_overlap and exists(select 1 from public.agenda_appointments where tenant_id=p_tenant_id and professional_user_id=v_professional
    and status in('SCHEDULED','CONFIRMED') and tstzrange(starts_at,ends_at) && tstzrange(v_start,v_end))
    then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  return jsonb_build_object('number',(p_session->>'number')::integer,'date',p_session->>'date','time',p_session->>'time',
    'serviceId',v_service.id,'serviceName',v_service.name,'professionalId',v_professional,'startsAt',v_start,'endsAt',v_end,
    'notes',left(coalesce(p_session->>'notes',''),700));
end $$;
revoke all on function private.contract_session_plan_item(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function private.contract_session_plan_item(uuid,jsonb,boolean),
  private.assert_professional_can_perform_service(uuid,uuid,uuid),private.assert_within_business_hours(uuid,timestamptz,timestamptz),
  private.assert_professional_available(uuid,uuid,timestamptz) to service_role;

create function public.contract_validate_sessions(p_tenant_id uuid,p_sessions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_plan jsonb := '[]'; v_normalized jsonb;
begin
  perform private.require_user();
  if not private.has_tenant_permission(p_tenant_id,'documents.write') or not private.has_tenant_permission(p_tenant_id,'agenda.write')
    then raise exception 'forbidden' using errcode='42501'; end if;
  if p_sessions is null or jsonb_typeof(p_sessions)<>'array' or jsonb_array_length(p_sessions)>100 then raise exception 'invalid_session'; end if;
  for v_item in select value from jsonb_array_elements(p_sessions) loop
    v_normalized := private.contract_session_plan_item(p_tenant_id,v_item,true);
    if exists(select 1 from jsonb_array_elements(v_plan) previous where previous->>'number'=v_normalized->>'number'
      or (previous->>'professionalId'=v_normalized->>'professionalId' and tstzrange((previous->>'startsAt')::timestamptz,(previous->>'endsAt')::timestamptz)
      && tstzrange((v_normalized->>'startsAt')::timestamptz,(v_normalized->>'endsAt')::timestamptz)))
      then raise exception 'session_overlap' using errcode='22023'; end if;
    v_plan := v_plan || jsonb_build_array(v_normalized);
  end loop;
  return v_plan;
end $$;
revoke all on function public.contract_validate_sessions(uuid,jsonb) from public,anon;
grant execute on function public.contract_validate_sessions(uuid,jsonb) to authenticated;

create function private.schedule_contract_session(p_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare r public.contract_session_appointments; s public.contract_signatures; v_id uuid; v_code text;
begin
  select * into r from public.contract_session_appointments where id=p_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into s from public.contract_signatures where id=r.signature_id;
  if s.status<>'SIGNED' or s.tenant_id<>r.tenant_id or s.customer_id<>r.customer_id then raise exception 'signature_required'; end if;
  if r.appointment_id is not null then return r.appointment_id; end if;
  begin
    if not exists(select 1 from public.agenda_services where tenant_id=r.tenant_id and id=r.service_id and is_active)
      then raise exception 'service_unavailable' using errcode='22023'; end if;
    if not exists(select 1 from public.tenant_users where tenant_id=r.tenant_id and user_id=r.professional_user_id and status='ACTIVE')
      then raise exception 'professional_unavailable' using errcode='22023'; end if;
    if r.starts_at<=now() then raise exception 'session_in_past' using errcode='22023'; end if;
    perform private.assert_professional_can_perform_service(r.tenant_id,r.service_id,r.professional_user_id);
    perform private.assert_within_business_hours(r.tenant_id,r.starts_at,r.ends_at);
    perform private.assert_professional_available(r.tenant_id,r.professional_user_id,r.starts_at);
    insert into public.agenda_appointments(tenant_id,customer_id,service_id,professional_user_id,starts_at,ends_at,origin,notes,created_by,idempotency_key)
      values(r.tenant_id,r.customer_id,r.service_id,r.professional_user_id,r.starts_at,r.ends_at,'contract_signature',
        left('Sessão '||r.session_number||' do contrato assinado. '||r.notes,1000),s.created_by,'contract-session:'||r.id)
      returning id into v_id;
    update public.contract_session_appointments set appointment_id=v_id,error_code=null where id=r.id;
    return v_id;
  exception when exclusion_violation or check_violation or foreign_key_violation or sqlstate '22023' then
    v_code := case when sqlstate='23P01' then 'slot_unavailable' else sqlerrm end;
    update public.contract_session_appointments set error_code=v_code where id=r.id;
    return null;
  end;
end $$;
revoke all on function private.schedule_contract_session(uuid) from public,anon,authenticated;
grant execute on function private.schedule_contract_session(uuid) to service_role;

create function private.schedule_signed_contract() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_item jsonb; v_id uuid;
begin
  if new.status='SIGNED' and old.status<>'SIGNED' then
    for v_item in select value from jsonb_array_elements(new.session_plan) loop
      insert into public.contract_session_appointments(signature_id,tenant_id,customer_id,session_number,service_id,professional_user_id,starts_at,ends_at,notes)
      values(new.id,new.tenant_id,new.customer_id,(v_item->>'number')::integer,(v_item->>'serviceId')::uuid,(v_item->>'professionalId')::uuid,
        (v_item->>'startsAt')::timestamptz,(v_item->>'endsAt')::timestamptz,coalesce(v_item->>'notes',''))
      returning id into v_id;
      perform private.schedule_contract_session(v_id);
    end loop;
  end if;
  return new;
end $$;
revoke all on function private.schedule_signed_contract(),private.protect_contract_session_plan() from public,anon,authenticated;
create trigger schedule_signed_contract after update on public.contract_signatures
for each row execute function private.schedule_signed_contract();

-- Authorized staff may resolve a conflict without changing the signed contract or scheduling twice.
create function public.contract_session_retry(p_session_id uuid,p_changes jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.contract_session_appointments; v_plan jsonb; v_id uuid;
begin
  perform private.require_user();
  select * into r from public.contract_session_appointments where id=p_session_id for update;
  if not found or not private.has_tenant_permission(r.tenant_id,'agenda.write') then raise exception 'forbidden' using errcode='42501'; end if;
  if r.appointment_id is not null then return r.appointment_id; end if;
  if p_changes is not null then
    v_plan := private.contract_session_plan_item(r.tenant_id,p_changes||jsonb_build_object('number',r.session_number),true);
    update public.contract_session_appointments set service_id=(v_plan->>'serviceId')::uuid,professional_user_id=(v_plan->>'professionalId')::uuid,
      starts_at=(v_plan->>'startsAt')::timestamptz,ends_at=(v_plan->>'endsAt')::timestamptz where id=r.id;
  end if;
  v_id := private.schedule_contract_session(r.id);
  if v_id is not null then
    insert into public.contract_signature_events(signature_id,event,metadata)
    values(r.signature_id,'SESSION_SCHEDULED',jsonb_build_object('session_number',r.session_number,'appointment_id',v_id,'actor',auth.uid(),'adjusted',p_changes is not null));
  end if;
  return v_id;
end $$;
revoke all on function public.contract_session_retry(uuid,jsonb) from public,anon;
grant execute on function public.contract_session_retry(uuid,jsonb) to authenticated;
