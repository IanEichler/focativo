-- A WhatsApp chat ID is sufficient to receive and reply while its phone is unresolved.
alter table public.customers drop constraint customers_needs_contact;
alter table public.customers add constraint customers_needs_contact check (
  phone is not null or whatsapp is not null or email is not null
  or (whatsapp_chat_id is not null and whatsapp_chat_id ~ '^[0-9]+@(lid|c[.]us)$')
);

create or replace function public.whatsapp_receive_message(
  p_tenant_id uuid,
  p_whatsapp_number text,
  p_content text default null,
  p_external_message_id text default null,
  p_sender_name text default null,
  p_media_path text default null,
  p_media_type text default null,
  p_whatsapp_chat_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_current_whatsapp text;
  v_is_new_customer boolean := false;
  v_default_stage_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_preview text;
  v_initial_status public.conversation_status;
begin
  if p_whatsapp_chat_id is not null and p_whatsapp_chat_id !~ '^[0-9]+@(lid|c[.]us)$' then
    raise exception 'invalid_chat_id';
  end if;
  -- Defend against older service versions sending a LID as a phone.
  if p_whatsapp_chat_id like '%@lid' and (
    p_whatsapp_number = split_part(p_whatsapp_chat_id, '@', 1)
    or p_whatsapp_number = '55' || split_part(p_whatsapp_chat_id, '@', 1)
  ) then
    p_whatsapp_number := null;
  end if;
  if p_whatsapp_number is null and p_whatsapp_chat_id is null then
    raise exception 'missing_contact_identity';
  end if;
  if p_external_message_id is not null then
    select id into v_message_id from public.messages
    where tenant_id = p_tenant_id and external_message_id = p_external_message_id;
    if found then
      return v_message_id;
    end if;
  end if;

  if p_whatsapp_chat_id is not null then
    select id, whatsapp into v_customer_id, v_current_whatsapp from public.customers
    where tenant_id = p_tenant_id and whatsapp_chat_id = p_whatsapp_chat_id and archived_at is null;
  end if;

  if v_customer_id is null then
    select id, whatsapp into v_customer_id, v_current_whatsapp from public.customers
    where tenant_id = p_tenant_id and (whatsapp = p_whatsapp_number or phone = p_whatsapp_number)
      and archived_at is null;
  end if;

  if v_customer_id is null then
    insert into public.customers (tenant_id, name, whatsapp, whatsapp_chat_id, origin)
    values (
      p_tenant_id, coalesce(nullif(btrim(p_sender_name), ''), case when p_whatsapp_number is null then 'Contato WhatsApp' else 'Cliente ' || p_whatsapp_number end), p_whatsapp_number,
      p_whatsapp_chat_id, 'whatsapp'
    )
    returning id into v_customer_id;
    v_is_new_customer := true;
  else
    if p_whatsapp_chat_id is not null then
      update public.customers set whatsapp_chat_id = p_whatsapp_chat_id
      where id = v_customer_id and whatsapp_chat_id is distinct from p_whatsapp_chat_id;
    end if;
    if p_whatsapp_number is distinct from v_current_whatsapp
       and p_whatsapp_number ~ '^[0-9]{10,15}$'
       and not exists (
         select 1 from public.customers
         where tenant_id = p_tenant_id and id <> v_customer_id and archived_at is null
           and (whatsapp = p_whatsapp_number or phone = p_whatsapp_number)
       )
    then
      update public.customers set whatsapp = p_whatsapp_number where id = v_customer_id;
    end if;
  end if;

  if v_is_new_customer then
    begin
      select id into v_default_stage_id from public.crm_stages
      where tenant_id = p_tenant_id and is_active and not is_won and not is_lost
      order by sort_order asc limit 1;

      if v_default_stage_id is not null then
        insert into public.crm_opportunities (tenant_id, customer_id, stage_id, origin)
        values (p_tenant_id, v_customer_id, v_default_stage_id, 'whatsapp');

        perform private.log_timeline_event(p_tenant_id, v_customer_id, 'crm.opportunity_created',
          jsonb_build_object('stage_id', v_default_stage_id, 'origin', 'whatsapp'), 'SYSTEM');
      end if;
    exception
      when others then
        null;
    end;
  end if;

  select case when enabled then 'AI_ACTIVE' else 'HUMAN_ACTIVE' end::public.conversation_status
  into v_initial_status
  from public.tenant_ai_settings where tenant_id = p_tenant_id;
  v_initial_status := coalesce(v_initial_status, 'HUMAN_ACTIVE');

  insert into public.conversations (tenant_id, customer_id, status)
  values (p_tenant_id, v_customer_id, v_initial_status)
  on conflict (tenant_id, customer_id) do update set
    status = case when public.conversations.status = 'CLOSED' then v_initial_status else public.conversations.status end,
    responsible_user_id = case
      when public.conversations.status = 'CLOSED' then null
      else public.conversations.responsible_user_id
    end
  returning id into v_conversation_id;

  v_preview := left(coalesce(p_content, case when p_media_path is not null then '[anexo]' else '' end), 200);

  begin
    insert into public.messages (
      tenant_id, conversation_id, direction, sender_type, content, media_path, media_type, external_message_id
    ) values (
      p_tenant_id, v_conversation_id, 'INBOUND', 'CUSTOMER', p_content, p_media_path, p_media_type, p_external_message_id
    )
    returning id into v_message_id;
  exception
    when unique_violation then
      select id into v_message_id from public.messages
      where tenant_id = p_tenant_id and external_message_id = p_external_message_id;
      return v_message_id;
  end;

  update public.conversations set
    unread_count = unread_count + 1,
    last_message_at = now(),
    last_message_preview = v_preview
  where id = v_conversation_id;

  perform private.log_timeline_event(p_tenant_id, v_customer_id, 'whatsapp.message_received',
    jsonb_build_object('conversation_id', v_conversation_id, 'preview', v_preview), 'SYSTEM');

  return v_message_id;
end;
$$;

-- Repair existing bogus values by identity, not by a guess about phone length.
create or replace function public.whatsapp_correct_number(
  p_tenant_id uuid, p_whatsapp_chat_id text, p_whatsapp_number text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_customer_id uuid;
  v_lid text := split_part(p_whatsapp_chat_id, '@', 1);
begin
  if p_whatsapp_number !~ '^[0-9]{10,15}$' or p_whatsapp_number is null
     or (p_whatsapp_chat_id like '%@lid' and p_whatsapp_number in (v_lid, '55' || v_lid)) then
    raise exception 'invalid_whatsapp_number';
  end if;
  select id into v_customer_id from public.customers
  where tenant_id = p_tenant_id and whatsapp_chat_id = p_whatsapp_chat_id and archived_at is null;
  if v_customer_id is null then return; end if;
  -- The contact-uniqueness trigger rejects a number belonging to another customer.
  update public.customers set whatsapp = p_whatsapp_number,
    phone = case when p_whatsapp_chat_id like '%@lid' and phone in (v_lid, '55' || v_lid)
      then p_whatsapp_number else phone end
  where id = v_customer_id and tenant_id = p_tenant_id;
end;
$$;

-- Webhook/service calls only: these functions accept a tenant ID and bypass RLS.
revoke all on function public.whatsapp_receive_message(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_receive_message(uuid,text,text,text,text,text,text,text) to service_role;
revoke all on function public.whatsapp_correct_number(uuid,text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_correct_number(uuid,text,text) to service_role;

update public.customers set
  whatsapp = case when whatsapp in (split_part(whatsapp_chat_id, '@', 1), '55' || split_part(whatsapp_chat_id, '@', 1)) then null else whatsapp end,
  phone = case when phone in (split_part(whatsapp_chat_id, '@', 1), '55' || split_part(whatsapp_chat_id, '@', 1)) then null else phone end
where whatsapp_chat_id ~ '^[0-9]+@lid$'
  and (whatsapp in (split_part(whatsapp_chat_id, '@', 1), '55' || split_part(whatsapp_chat_id, '@', 1))
    or phone in (split_part(whatsapp_chat_id, '@', 1), '55' || split_part(whatsapp_chat_id, '@', 1)));
