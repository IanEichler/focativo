-- =============================================================================
-- Corrige duplicação de clientes de WhatsApp: whatsapp_receive_message casava
-- o cliente só pelo NÚMERO (p_whatsapp_number). Confirmado ao vivo (logs de
-- produção) que a resolução do número via getContactLidAndPhone é instável —
-- funciona em algumas mensagens e falha em outras para o MESMO contato,
-- caindo no fallback (dígitos crus do pseudo-ID "@lid", ex.: 30447375491177).
-- Resultado: cada falha de resolução criava um cliente novo pro mesmo
-- contato real, fragmentando a conversa (5 registros "Ian" pro mesmo número).
--
-- Fix: casar primeiro por whatsapp_chat_id (message.from bruto — esse sim
-- estável, sempre igual pro mesmo contato, mesmo quando o telefone resolvido
-- varia). Só cai para casar por número quando ainda não temos chat_id salvo
-- (clientes antigos, ou primeira mensagem sem chat_id informado).
--
-- Também evita que um número "ruim" (claramente um LID cru, > 13 dígitos)
-- sobrescreva um número já bom salvo antes — só atualiza o telefone quando
-- o novo valor parece mais confiável que o salvo.
-- =============================================================================

drop function if exists public.whatsapp_receive_message(uuid, text, text, text, text, text, text, text);

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

  if p_whatsapp_chat_id is not null then
    select id, whatsapp into v_customer_id, v_current_whatsapp from public.customers
    where tenant_id = p_tenant_id and whatsapp_chat_id = p_whatsapp_chat_id and archived_at is null;
  end if;

  if v_customer_id is null then
    select id, whatsapp into v_customer_id, v_current_whatsapp from public.customers
    where tenant_id = p_tenant_id and whatsapp = p_whatsapp_number and archived_at is null;
  end if;

  if v_customer_id is null then
    insert into public.customers (tenant_id, name, whatsapp, whatsapp_chat_id, origin)
    values (
      p_tenant_id, coalesce(nullif(btrim(p_sender_name), ''), 'Cliente ' || p_whatsapp_number), p_whatsapp_number,
      p_whatsapp_chat_id, 'whatsapp'
    )
    returning id into v_customer_id;
  else
    if p_whatsapp_chat_id is not null then
      update public.customers set whatsapp_chat_id = p_whatsapp_chat_id
      where id = v_customer_id and whatsapp_chat_id is distinct from p_whatsapp_chat_id;
    end if;
    -- Só troca o telefone salvo se o novo parecer mais confiável (<= 13
    -- dígitos, formato de telefone real) e o salvo hoje parecer ruim (vazio
    -- ou claramente um LID cru, > 13 dígitos) — nunca degrada um número bom.
    if p_whatsapp_number is distinct from v_current_whatsapp
       and char_length(p_whatsapp_number) <= 13
       and (v_current_whatsapp is null or char_length(v_current_whatsapp) > 13)
       and not exists (
         select 1 from public.customers
         where tenant_id = p_tenant_id and whatsapp = p_whatsapp_number and archived_at is null and id <> v_customer_id
       )
    then
      update public.customers set whatsapp = p_whatsapp_number where id = v_customer_id;
    end if;
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

-- A assinatura é a mesma de antes (8 parâmetros) mas o DROP recria o objeto,
-- que volta ao default do Postgres (EXECUTE para PUBLIC) até revogar de novo.
revoke all on function
  public.whatsapp_receive_message(uuid, text, text, text, text, text, text, text)
from public, anon;

grant execute on function
  public.whatsapp_receive_message(uuid, text, text, text, text, text, text, text)
to authenticated, service_role;
