-- =============================================================================
-- Guarda o ID de chat bruto do WhatsApp (ex.: "1234567890@lid" ou
-- "5511999998888@c.us") ao lado do telefone.
--
-- Descoberto ao vivo: desde a migração do WhatsApp para IDs "@lid", NENHUMA
-- reconstrução de endereço a partir só do telefone funciona de forma
-- confiável no engine usado por whatsapp-web.js (nem "<telefone>@c.us" nem
-- o getNumberId da própria lib, que também falha para esses contatos) — o
-- envio quebra com "No LID for user" (bug aberto e ainda sem correção
-- definitiva rio acima). O único ID que sempre funciona é o que o próprio
-- WhatsApp manda no recebimento (message.from) — guardamos ele bruto e
-- REUSAMOS na hora de responder, em vez de tentar re-derivar.
-- =============================================================================

alter table public.customers add column whatsapp_chat_id text
  check (whatsapp_chat_id is null or char_length(whatsapp_chat_id) <= 128);

-- CREATE OR REPLACE não troca a função quando a lista de parâmetros muda de
-- tamanho (isso cria um overload novo, deixando os dois ambíguos para
-- chamadas com só os parâmetros obrigatórios) — precisa dropar a versão de
-- 7 parâmetros antes de criar a de 8.
drop function if exists public.whatsapp_receive_message(uuid, text, text, text, text, text, text);

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
    insert into public.customers (tenant_id, name, whatsapp, whatsapp_chat_id, origin)
    values (
      p_tenant_id, coalesce(nullif(btrim(p_sender_name), ''), 'Cliente ' || p_whatsapp_number), p_whatsapp_number,
      p_whatsapp_chat_id, 'whatsapp'
    )
    returning id into v_customer_id;
  elsif p_whatsapp_chat_id is not null then
    -- Backfill: clientes criados antes desta coluna existir, ou cujo ID
    -- salvo ficou desatualizado, recebem o ID mais recente visto de verdade.
    update public.customers set whatsapp_chat_id = p_whatsapp_chat_id
    where id = v_customer_id and whatsapp_chat_id is distinct from p_whatsapp_chat_id;
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

-- A assinatura mudou (8 parâmetros): o DROP acima criou um objeto novo, que
-- volta ao default do Postgres (EXECUTE para PUBLIC) até revogar de novo.
revoke all on function
  public.whatsapp_receive_message(uuid, text, text, text, text, text, text, text)
from public, anon;

grant execute on function
  public.whatsapp_receive_message(uuid, text, text, text, text, text, text, text)
to authenticated, service_role;
