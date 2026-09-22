-- =============================================================================
-- Encerrar atendimento (pedido do usuário) + reabertura automática.
--
-- Decisão de escopo: WhatsApp continua sendo UMA thread persistente por
-- cliente (nunca fragmentamos o histórico em "conversas" separadas — ver
-- decisão original da Fase 6). "Ticket" aqui é um ESTADO sobre essa mesma
-- thread: encerrar marca status = CLOSED; quando o cliente escreve de novo,
-- whatsapp_receive_message reabre a MESMA conversa como se fosse nova (IA se
-- o tenant tiver ligado, senão humano) — exatamente a regra de uma conversa
-- realmente nova. Uma conversa que não estava CLOSED (ativa/pausada) continua
-- sem ter o status mexido por uma mensagem chegando (regra original,
-- preservada).
-- =============================================================================

create or replace function public.conversation_close(p_conversation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
begin
  v_conversation := private.load_conversation_for_write(p_conversation_id);
  if v_conversation.status = 'CLOSED' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;

  update public.conversations set status = 'CLOSED', responsible_user_id = null where id = p_conversation_id;
  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'conversation.closed',
    jsonb_build_object('conversation_id', p_conversation_id, 'reason', p_reason));
end;
$$;

create or replace function public.whatsapp_receive_message(
  p_tenant_id uuid,
  p_whatsapp_number text,
  p_content text default null,
  p_external_message_id text default null,
  p_sender_name text default null,
  p_media_path text default null,
  p_media_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_preview text;
  v_initial_status public.conversation_status;
begin
  if p_external_message_id is not null then
    select id into v_message_id from public.messages
    where tenant_id = p_tenant_id and external_message_id = p_external_message_id;
    if found then
      return v_message_id;
    end if;
  end if;

  select id into v_customer_id from public.customers
  where tenant_id = p_tenant_id and whatsapp = p_whatsapp_number and archived_at is null;

  if v_customer_id is null then
    insert into public.customers (tenant_id, name, whatsapp, origin)
    values (p_tenant_id, coalesce(nullif(btrim(p_sender_name), ''), 'Cliente ' || p_whatsapp_number), p_whatsapp_number, 'whatsapp')
    returning id into v_customer_id;
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

revoke all on function public.conversation_close(uuid, text) from public, anon;
grant execute on function public.conversation_close(uuid, text) to authenticated, service_role;
