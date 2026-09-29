-- Only the backend can consult appointment slots; no customer data is returned.
create function public.ai_agenda_availability(
  p_conversation_id uuid, p_service_id uuid, p_date date, p_professional_user_id uuid default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tenant uuid; v_timezone text; v_duration integer; v_hours public.tenant_business_hours;
  v_slots jsonb;
begin
  if (select auth.uid()) is not null then raise exception 'forbidden' using errcode = '42501'; end if;
  select c.tenant_id, t.timezone into v_tenant, v_timezone from public.conversations c
    join public.tenants t on t.id = c.tenant_id where c.id = p_conversation_id and c.status = 'AI_ACTIVE';
  if not found then raise exception 'conversation_not_ai_active' using errcode = '22023'; end if;
  if not exists(select 1 from public.tenant_ai_settings where tenant_id=v_tenant and enabled)
    or exists(select 1 from public.tenant_module_flags where tenant_id=v_tenant and module_code in ('ai','agenda') and not enabled)
    then raise exception 'ai_disabled' using errcode = '42501'; end if;
  if p_date is null or p_date < (now() at time zone v_timezone)::date or p_date > (now() at time zone v_timezone)::date + 365
    then raise exception 'invalid_date' using errcode = '22023'; end if;
  select duration_minutes into v_duration from public.agenda_services where id=p_service_id and tenant_id=v_tenant and is_active;
  if not found then raise exception 'service_not_found' using errcode = 'P0002'; end if;
  select * into v_hours from public.tenant_business_hours where tenant_id=v_tenant and day_of_week=extract(dow from p_date);
  if not found then return jsonb_build_object('status','hours_not_configured','timezone',v_timezone,'date',p_date,'slots','[]'::jsonb); end if;
  if v_hours.is_closed then return jsonb_build_object('status','closed','timezone',v_timezone,'date',p_date,'slots','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'starts_at',slot.starts_at,'local_time',to_char(slot.starts_at at time zone v_timezone,'HH24:MI'),
    'professional_user_id',slot.user_id,'professional_name',slot.full_name
  ) order by slot.starts_at,slot.full_name), '[]'::jsonb) into v_slots from (
    select s.starts_at, u.user_id, pr.full_name
    from generate_series((p_date + v_hours.opens_at) at time zone v_timezone,
      (p_date + v_hours.closes_at) at time zone v_timezone - make_interval(mins=>v_duration), interval '15 minutes') s(starts_at)
    cross join public.tenant_users u join public.profiles pr on pr.id=u.user_id
    where u.tenant_id=v_tenant and u.status='ACTIVE' and nullif(btrim(pr.full_name),'') is not null
      and (p_professional_user_id is null or u.user_id=p_professional_user_id)
      and s.starts_at > now()
      and (not exists(select 1 from public.agenda_service_professionals where service_id=p_service_id)
        or exists(select 1 from public.agenda_service_professionals where service_id=p_service_id and professional_user_id=u.user_id))
      and not exists(select 1 from public.agenda_professional_exceptions where tenant_id=v_tenant and professional_user_id=u.user_id and date=p_date)
      and not exists(select 1 from public.agenda_appointments a where a.tenant_id=v_tenant and a.professional_user_id=u.user_id
        and a.status in ('SCHEDULED','CONFIRMED') and tstzrange(a.starts_at,a.ends_at) && tstzrange(s.starts_at,s.starts_at+make_interval(mins=>v_duration)))
    order by s.starts_at,u.user_id limit 200
  ) slot;
  return jsonb_build_object('status',case when jsonb_array_length(v_slots)>0 then 'available' else 'no_slots' end,
    'timezone',v_timezone,'date',p_date,'duration_minutes',v_duration,'slots',v_slots);
end; $$;
revoke all on function public.ai_agenda_availability(uuid,uuid,date,uuid) from public, anon, authenticated;
grant execute on function public.ai_agenda_availability(uuid,uuid,date,uuid) to service_role;

-- Preserve the existing human-confirmation setting for other companies, but
-- reject unconfigured hours and invalid slots before any handoff or booking.
create or replace function public.ai_agenda_book(
  p_conversation_id uuid,
  p_service_id uuid,
  p_professional_user_id uuid,
  p_starts_at timestamptz,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_service public.agenda_services;
  v_ends_at timestamptz;
  v_appointment_id uuid;
  v_cleared boolean;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'conversation_id';
  end if;
  perform private.require_ai_service_call(v_conversation.tenant_id);
  if v_conversation.status <> 'AI_ACTIVE' then raise exception 'conversation_not_ai_active' using errcode='22023'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'invalid_date' using errcode='22023'; end if;
  if exists(select 1 from public.tenant_module_flags where tenant_id=v_conversation.tenant_id and module_code='agenda' and not enabled)
    then raise exception 'agenda_disabled' using errcode='42501'; end if;
  if not exists(select 1 from public.tenant_users where tenant_id=v_conversation.tenant_id and user_id=p_professional_user_id and status='ACTIVE')
    then raise exception 'professional_not_eligible' using errcode='22023'; end if;
  if not exists(select 1 from public.tenant_business_hours h join public.tenants t on t.id=h.tenant_id
    where h.tenant_id=v_conversation.tenant_id and h.day_of_week=extract(dow from p_starts_at at time zone t.timezone))
    then raise exception 'hours_not_configured' using errcode='22023'; end if;

  select * into v_service from public.agenda_services
  where id = p_service_id and tenant_id = v_conversation.tenant_id and is_active;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'service_id';
  end if;

  perform private.assert_professional_can_perform_service(v_conversation.tenant_id, p_service_id, p_professional_user_id);
  v_ends_at := p_starts_at + (v_service.duration_minutes || ' minutes')::interval;
  perform private.assert_within_business_hours(v_conversation.tenant_id, p_starts_at, v_ends_at);
  perform private.assert_professional_available(v_conversation.tenant_id, p_professional_user_id, p_starts_at);

  if v_service.requires_human_confirmation then
    -- "@>" faz match EXATO de elemento dentro de array (não subset parcial de
    -- objeto) — jsonb_path_exists é o jeito certo de perguntar "existe um
    -- elemento com essas chaves", tolerando outras chaves no objeto.
    select coalesce(
      jsonb_path_exists(draft_items, '$[*] ? (@.type == "appointment_pending" && @.human_cleared == true)'),
      false
    )
    into v_cleared
    from public.ai_conversation_states where conversation_id = p_conversation_id;

    if not coalesce(v_cleared, false) then
      raise exception 'human_confirmation_required' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.agenda_appointments (
      tenant_id, customer_id, service_id, professional_user_id, starts_at, ends_at, origin, notes
    ) values (
      v_conversation.tenant_id, v_conversation.customer_id, p_service_id, p_professional_user_id, p_starts_at, v_ends_at,
      'ai', nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = '23P01';
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'appointment';
  end;

  update public.ai_conversation_states set draft_items = '[]'::jsonb
  where conversation_id = p_conversation_id
    and jsonb_path_exists(draft_items, '$[*] ? (@.type == "appointment_pending")');

  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'appointment.created',
    jsonb_build_object('appointment_id', v_appointment_id, 'service_id', p_service_id, 'conversation_id', p_conversation_id),
    'AI');

  return v_appointment_id;
end;
$$;

