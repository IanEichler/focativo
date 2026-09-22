-- =============================================================================
-- FASE 6 · Serviço WhatsApp, sessões/QR, Inbox e handoff humano
--
-- Nenhum domínio comercial depende de whatsapp-web.js diretamente: o banco só
-- conhece `whatsapp_accounts`/`conversations`/`messages` e um contrato de
-- webhook (seção 32 — "nenhum domínio comercial deve depender diretamente de
-- whatsapp-web.js"). A integração de verdade mora em services/whatsapp (Node
-- separado, PM2 próprio — seção 33: uma sessão Chromium travada não pode
-- derrubar estoque/CRM/vendas/financeiro), fora do Supabase.
--
-- Decisão de escopo — `conversation_states` (citada na lista de entidades
-- sugeridas) não vira tabela agora: sem AIProvider (Fase 7), não há estado de
-- IA para guardar. `conversations.status` (AI_ACTIVE/HUMAN_ACTIVE/PAUSED) já
-- cobre o handoff humano da Fase 6; a Fase 7 pode acrescentar uma tabela de
-- contexto conversacional quando a IA existir de fato.
--
-- Sem AIProvider ainda, uma conversa nova nasce HUMAN_ACTIVE (não AI_ACTIVE):
-- não existe IA para atender, então um humano precisa ver a mensagem. Os
-- botões "Assumir atendimento"/"Devolver para IA" (seção 36) já existem e
-- funcionam de verdade — só não há IA do outro lado até a Fase 7.
-- =============================================================================

create type public.whatsapp_status as enum ('DISCONNECTED', 'WAITING_QR', 'CONNECTED', 'ERROR');
create type public.conversation_status as enum ('AI_ACTIVE', 'HUMAN_ACTIVE', 'PAUSED');
create type public.message_direction as enum ('INBOUND', 'OUTBOUND');
create type public.message_sender_type as enum ('CUSTOMER', 'USER', 'AI', 'SYSTEM');
create type public.message_status as enum ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- -----------------------------------------------------------------------------
-- Conta/sessão do WhatsApp (uma por tenant na V1)
-- -----------------------------------------------------------------------------

create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status public.whatsapp_status not null default 'DISCONNECTED',
  phone_number text check (phone_number is null or phone_number ~ '^[0-9]{10,15}$'),
  qr_code text,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  connected_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_accounts_tenant_unique unique (tenant_id)
);

create trigger whatsapp_accounts_set_updated_at
  before update on public.whatsapp_accounts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Conversas (uma por cliente — WhatsApp é uma thread persistente, não tickets)
-- -----------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  status public.conversation_status not null default 'HUMAN_ACTIVE',
  responsible_user_id uuid references public.profiles (id) on delete set null,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_tenant_id_id_key unique (tenant_id, id),
  constraint conversations_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint conversations_customer_unique unique (tenant_id, customer_id)
);

create index conversations_tenant_last_message_idx on public.conversations (tenant_id, last_message_at desc nulls last);
create index conversations_tenant_status_idx on public.conversations (tenant_id, status);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function private.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid not null,
  direction public.message_direction not null,
  sender_type public.message_sender_type not null,
  sender_user_id uuid references public.profiles (id) on delete set null,
  content text check (content is null or char_length(content) <= 4000),
  media_path text,
  media_type text check (media_type is null or media_type ~ '^[a-z][a-z_/]{1,49}$'),
  external_message_id text check (external_message_id is null or char_length(external_message_id) <= 128),
  status public.message_status not null default 'SENT',
  failed_reason text check (failed_reason is null or char_length(failed_reason) <= 500),
  created_at timestamptz not null default now(),
  constraint messages_tenant_id_id_key unique (tenant_id, id),
  constraint messages_conversation_fkey foreign key (tenant_id, conversation_id)
    references public.conversations (tenant_id, id) on delete cascade,
  constraint messages_content_or_media check (content is not null or media_path is not null)
);

create unique index messages_external_id_unique
  on public.messages (tenant_id, external_message_id) where external_message_id is not null;
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create trigger messages_prevent_delete
  before delete on public.messages
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function private.load_conversation_for_write(p_conversation_id uuid, p_permission text default 'whatsapp.write')
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
begin
  perform private.require_user();
  select * into v_conversation from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_conversation.tenant_id, p_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_conversation;
end;
$$;

-- -----------------------------------------------------------------------------
-- Recebimento de mensagem (chamado pela rota de webhook via service role —
-- auth.uid() nulo, autorização é a assinatura HMAC já validada na rota HTTP).
-- Idempotente por external_message_id: reentrega do serviço nunca duplica.
-- -----------------------------------------------------------------------------

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

  insert into public.conversations (tenant_id, customer_id)
  values (p_tenant_id, v_customer_id)
  on conflict (tenant_id, customer_id) do update set tenant_id = excluded.tenant_id
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

-- -----------------------------------------------------------------------------
-- Envio de mensagem: grava a intenção (QUEUED); a aplicação despacha pelo
-- WhatsAppProvider e chama message_mark_sent/message_mark_failed com o
-- resultado real (nunca finge sucesso no banco antes de tentar enviar).
-- -----------------------------------------------------------------------------

create or replace function public.message_send(
  p_conversation_id uuid,
  p_content text default null,
  p_media_path text default null,
  p_media_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_conversation public.conversations;
  v_message_id uuid;
begin
  v_conversation := private.load_conversation_for_write(p_conversation_id, 'whatsapp.write');
  v_uid := (select auth.uid());

  begin
    insert into public.messages (
      tenant_id, conversation_id, direction, sender_type, sender_user_id, content, media_path, media_type, status
    ) values (
      v_conversation.tenant_id, p_conversation_id, 'OUTBOUND', 'USER', v_uid, p_content, p_media_path, p_media_type, 'QUEUED'
    )
    returning id into v_message_id;
  exception
    when check_violation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'message';
  end;

  update public.conversations set
    last_message_at = now(),
    last_message_preview = left(coalesce(p_content, case when p_media_path is not null then '[anexo]' else '' end), 200)
  where id = p_conversation_id;

  return v_message_id;
end;
$$;

-- Chamadas pela aplicação após o WhatsAppProvider confirmar/recusar o envio.
-- Aceitam auth.uid() nulo (a mesma requisição do servidor que chamou
-- message_send já validou a permissão; o provider roda depois, assíncrono).
create or replace function public.message_mark_sent(p_message_id uuid, p_external_message_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages set status = 'SENT', external_message_id = coalesce(p_external_message_id, external_message_id)
  where id = p_message_id and status = 'QUEUED';
end;
$$;

create or replace function public.message_mark_failed(p_message_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages set status = 'FAILED', failed_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_message_id and status = 'QUEUED';
end;
$$;

-- -----------------------------------------------------------------------------
-- Handoff humano (seção 36)
-- -----------------------------------------------------------------------------

create or replace function public.conversation_assume(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
begin
  v_conversation := private.load_conversation_for_write(p_conversation_id);
  update public.conversations set status = 'HUMAN_ACTIVE', responsible_user_id = (select auth.uid())
  where id = p_conversation_id;
  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'conversation.assumed',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;

create or replace function public.conversation_return_to_ai(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
begin
  v_conversation := private.load_conversation_for_write(p_conversation_id);
  update public.conversations set status = 'AI_ACTIVE', responsible_user_id = null
  where id = p_conversation_id;
  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'conversation.returned_to_ai',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;

create or replace function public.conversation_pause(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
begin
  v_conversation := private.load_conversation_for_write(p_conversation_id);
  update public.conversations set status = 'PAUSED' where id = p_conversation_id;
  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'conversation.paused',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;

create or replace function public.conversation_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.load_conversation_for_write(p_conversation_id, 'whatsapp.read');
  update public.conversations set unread_count = 0 where id = p_conversation_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('whatsapp.read', 'whatsapp', 'Ver o Inbox e as conversas de WhatsApp'),
  ('whatsapp.write', 'whatsapp', 'Responder conversas, assumir/devolver/pausar o atendimento');

insert into public.role_permissions (role_code, permission_code)
select r.code, p.code
from public.roles r
cross join unnest(array['whatsapp.read', 'whatsapp.write']) as p(code)
where r.code in ('OWNER', 'ADMIN', 'GERENTE', 'VENDEDOR');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.whatsapp_accounts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- A conexão (QR/conectar/desconectar) é infraestrutura da empresa: mesma
-- permissão das configurações gerais, não whatsapp.read/write (que são sobre
-- atendimento, não sobre a sessão em si).
create policy whatsapp_accounts_select on public.whatsapp_accounts for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('tenant.update')));
create policy conversations_select on public.conversations for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('whatsapp.read')));
create policy messages_select on public.messages for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('whatsapp.read')));

revoke all on public.whatsapp_accounts, public.conversations, public.messages from anon, authenticated;

grant select on public.whatsapp_accounts, public.conversations, public.messages to authenticated;
grant all on public.whatsapp_accounts, public.conversations, public.messages to service_role;

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.whatsapp_receive_message(uuid, text, text, text, text, text, text),
  public.message_send(uuid, text, text, text),
  public.message_mark_sent(uuid, text),
  public.message_mark_failed(uuid, text),
  public.conversation_assume(uuid),
  public.conversation_return_to_ai(uuid),
  public.conversation_pause(uuid),
  public.conversation_mark_read(uuid)
from public, anon;

grant execute on function
  public.whatsapp_receive_message(uuid, text, text, text, text, text, text),
  public.message_send(uuid, text, text, text),
  public.message_mark_sent(uuid, text),
  public.message_mark_failed(uuid, text),
  public.conversation_assume(uuid),
  public.conversation_return_to_ai(uuid),
  public.conversation_pause(uuid),
  public.conversation_mark_read(uuid)
to authenticated, service_role;
