-- =============================================================================
-- FASE 7 · AIProvider, tools controladas, estado conversacional, custos
--
-- Escopo desta fase (seções do prompt mestre sobre IA/venda assistida):
--   * tenant_ai_settings: liga/desliga a IA por tenant (desligada por padrão —
--     nenhum tenant paga por chamadas de IA sem ativar explicitamente),
--     prompt de sistema customizável, modelo e orçamento mensal opcional.
--   * ai_conversation_states: o "estado conversacional" — bem enxuto de
--     propósito (contador de turnos + rascunho de itens em negociação), nunca
--     pede ao modelo para autodescrever seu próprio estado numa chamada
--     separada (custo/complexidade sem benefício claro nesta v1).
--   * ai_usage_events: razão de custo append-only (tokens + custo estimado),
--     mesma filosofia do financeiro da Fase 5 — sem tabela paralela de saldo,
--     agregado sob demanda.
--
-- Ações da IA (buscar produto, criar reserva, escalar para humano) NUNCA
-- reaproveitam as RPCs de staff (reservation_create, message_send, etc.) via
-- um "bypass" na função compartilhada `private.require_user()` — essa função
-- é usada por ~25 RPCs diferentes e relaxá-la abriria uma porta larga demais.
-- Em vez disso, cada ação da IA ganha uma RPC própria, pequena e auditável,
-- que exige `auth.uid()` nulo (só o caminho de serviço, nunca um usuário
-- autenticado) e confirma `tenant_ai_settings.enabled` antes de agir — mesma
-- lição da Fase 5 (`reservation_complete`) levada ao extremo correto: nunca
-- relaxar um helper compartilhado, só a função específica que precisa do
-- caminho novo — e aqui nem isso, porque `reservation_create`/`message_send`
-- são usados por humanos todo dia e não deviam ganhar um desvio de permissão.
-- =============================================================================

create table public.tenant_ai_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  enabled boolean not null default false,
  system_prompt text check (system_prompt is null or char_length(system_prompt) <= 4000),
  model text not null default 'claude-sonnet-5',
  max_tokens_per_reply integer not null default 1024 check (max_tokens_per_reply between 64 and 4096),
  monthly_budget_cents integer check (monthly_budget_cents is null or monthly_budget_cents >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenant_ai_settings enable row level security;

-- Só leitura direta (quem administra o tenant); toda escrita passa por RPC.
create policy tenant_ai_settings_select on public.tenant_ai_settings for select to authenticated
  using (private.has_tenant_permission(tenant_id, 'tenant.update'));
revoke all on public.tenant_ai_settings from anon, authenticated;
grant select on public.tenant_ai_settings to authenticated;
grant all on public.tenant_ai_settings to service_role;

create table public.ai_conversation_states (
  tenant_id uuid not null,
  conversation_id uuid primary key,
  turn_count integer not null default 0,
  last_tool_used text,
  draft_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ai_conversation_states_conversation_fkey foreign key (tenant_id, conversation_id)
    references public.conversations (tenant_id, id) on delete cascade
);

alter table public.ai_conversation_states enable row level security;

create policy ai_conversation_states_select on public.ai_conversation_states for select to authenticated
  using (private.has_tenant_permission(tenant_id, 'whatsapp.read'));
revoke all on public.ai_conversation_states from anon, authenticated;
grant select on public.ai_conversation_states to authenticated;
grant all on public.ai_conversation_states to service_role;

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid,
  message_id uuid,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(10, 4) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_events_tenant_created_idx on public.ai_usage_events (tenant_id, created_at desc);

alter table public.ai_usage_events enable row level security;

-- Dado financeiro (custo real de operar a IA): mesma permissão do painel financeiro.
create policy ai_usage_events_select on public.ai_usage_events for select to authenticated
  using (private.has_tenant_permission(tenant_id, 'financial.read'));
revoke all on public.ai_usage_events from anon, authenticated;
grant select on public.ai_usage_events to authenticated;
grant all on public.ai_usage_events to service_role;

-- Razão de custo: nunca editado nem apagado, nem pelo service_role por engano.
create trigger ai_usage_events_prevent_update before update on public.ai_usage_events
  for each row execute function private.prevent_mutation();
create trigger ai_usage_events_prevent_delete before delete on public.ai_usage_events
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Configuração (RPC — só quem administra o tenant)
-- -----------------------------------------------------------------------------

-- `setof` (não um composto escalar): pela API REST, uma função set-returning
-- sempre volta como array no `data` do supabase-js — mesma convenção de
-- catalog_search_variants — em vez do formato ambíguo de um composto solto.
create or replace function public.ai_settings_get(p_tenant_id uuid)
returns setof public.tenant_ai_settings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_settings public.tenant_ai_settings;
begin
  if not private.has_tenant_permission(p_tenant_id, 'tenant.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_settings from public.tenant_ai_settings where tenant_id = p_tenant_id;
  if not found then
    v_settings.tenant_id := p_tenant_id;
    v_settings.enabled := false;
    v_settings.model := 'claude-sonnet-5';
    v_settings.max_tokens_per_reply := 1024;
  end if;
  return next v_settings;
end;
$$;

create or replace function public.ai_settings_update(
  p_tenant_id uuid,
  p_enabled boolean,
  p_system_prompt text default null,
  p_model text default 'claude-sonnet-5',
  p_max_tokens_per_reply integer default 1024,
  p_monthly_budget_cents integer default null
)
returns setof public.tenant_ai_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_settings public.tenant_ai_settings;
begin
  if not private.has_tenant_permission(p_tenant_id, 'tenant.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.tenant_ai_settings (
    tenant_id, enabled, system_prompt, model, max_tokens_per_reply, monthly_budget_cents, updated_by
  ) values (
    p_tenant_id, p_enabled, nullif(btrim(coalesce(p_system_prompt, '')), ''), coalesce(nullif(btrim(p_model), ''), 'claude-sonnet-5'),
    coalesce(p_max_tokens_per_reply, 1024), p_monthly_budget_cents, v_uid
  )
  on conflict (tenant_id) do update set
    enabled = excluded.enabled,
    system_prompt = excluded.system_prompt,
    model = excluded.model,
    max_tokens_per_reply = excluded.max_tokens_per_reply,
    monthly_budget_cents = excluded.monthly_budget_cents,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_settings;

  perform private.log_audit(p_tenant_id, 'ai.settings_updated', 'tenant_ai_settings', p_tenant_id::text,
    p_after => jsonb_build_object('enabled', p_enabled, 'model', v_settings.model));

  return next v_settings;
end;
$$;

-- Soma de custo do mês corrente — usada pela UI e pelo próprio agente (corte
-- de orçamento). `language plpgsql` de propósito (não `sql`): precisa da
-- checagem explícita de permissão abaixo, já que uma função `security
-- definer` ignora a RLS da tabela — mesmo cuidado de `financial_summary`
-- (Fase 5), sem o qual um VENDEDOR (tem `whatsapp.read` mas não
-- `financial.read`) conseguiria o custo agregado por aqui.
create or replace function public.ai_usage_month_to_date(p_tenant_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total numeric;
begin
  if (select auth.uid()) is not null and not private.has_tenant_permission(p_tenant_id, 'financial.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(sum(cost_usd), 0) into v_total
  from public.ai_usage_events
  where tenant_id = p_tenant_id and created_at >= date_trunc('month', now());
  return v_total;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ações da IA — todas exigem auth.uid() nulo (caminho de serviço) e IA ligada.
-- -----------------------------------------------------------------------------

create or replace function private.require_ai_service_call(p_tenant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    raise exception 'forbidden' using errcode = '42501', detail = 'ai_actions_are_service_only';
  end if;
  if not exists (select 1 from public.tenant_ai_settings where tenant_id = p_tenant_id and enabled) then
    raise exception 'ai_disabled' using errcode = '42501';
  end if;
end;
$$;

-- Envia uma resposta da IA (mesmo formato de message_send, mas sender_type AI
-- e sem exigir usuário autenticado — quem chamou já validou IA ligada).
create or replace function public.ai_message_send(p_conversation_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_message_id uuid;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'conversation_id';
  end if;
  perform private.require_ai_service_call(v_conversation.tenant_id);

  begin
    insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, status)
    values (v_conversation.tenant_id, p_conversation_id, 'OUTBOUND', 'AI', p_content, 'QUEUED')
    returning id into v_message_id;
  exception
    when check_violation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'message';
  end;

  update public.conversations set last_message_at = now(), last_message_preview = left(coalesce(p_content, ''), 200)
  where id = p_conversation_id;

  return v_message_id;
end;
$$;

create or replace function public.ai_log_usage(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_usd numeric,
  p_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.ai_usage_events (tenant_id, conversation_id, message_id, model, input_tokens, output_tokens, cost_usd)
  values (p_tenant_id, p_conversation_id, p_message_id, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), coalesce(p_cost_usd, 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- Ação de venda assistida: cria uma reserva em nome do cliente da conversa.
-- Mesmo modelo de reservation_create (preço travado no servidor via
-- price_sale_items, estoque via apply_stock_movement), mas com origin='ai' e
-- created_by/responsible_user_id nulos (nenhum funcionário envolvido ainda).
create or replace function public.ai_reservation_create(
  p_conversation_id uuid,
  p_items jsonb,
  p_expires_at timestamptz default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_reservation_id uuid;
  v_existing_id uuid;
  v_priced record;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'conversation_id';
  end if;
  perform private.require_ai_service_call(v_conversation.tenant_id);

  if p_idempotency_key is not null then
    select id into v_existing_id from public.reservations
    where tenant_id = v_conversation.tenant_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing_id;
    end if;
  end if;

  begin
    insert into public.reservations (tenant_id, customer_id, origin, notes, expires_at, idempotency_key)
    values (
      v_conversation.tenant_id, v_conversation.customer_id, 'ai', nullif(btrim(coalesce(p_notes, '')), ''),
      coalesce(p_expires_at, now() + interval '2 days'), p_idempotency_key
    )
    returning id into v_reservation_id;
  exception
    when unique_violation then
      select id into v_existing_id from public.reservations
      where tenant_id = v_conversation.tenant_id and idempotency_key = p_idempotency_key;
      if v_existing_id is not null then
        return v_existing_id;
      end if;
      raise exception 'invalid_input' using errcode = '22023', detail = 'reservation';
    when check_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'reservation';
  end;

  for v_priced in select * from private.price_sale_items(v_conversation.tenant_id, p_items) loop
    insert into public.reservation_items (tenant_id, reservation_id, variant_id, quantity, unit_price)
    values (v_conversation.tenant_id, v_reservation_id, v_priced.variant_id, v_priced.quantity, v_priced.unit_price);

    perform private.apply_stock_movement(
      p_tenant_id => v_conversation.tenant_id,
      p_variant_id => v_priced.variant_id,
      p_type => 'RESERVATION',
      p_quantity => v_priced.quantity,
      p_origin => 'RESERVATION',
      p_reference_type => 'reservation',
      p_reference_id => v_reservation_id,
      p_idempotency_key => case when p_idempotency_key is not null
        then p_idempotency_key || ':' || v_priced.variant_id::text end,
      p_actor_type => 'AI',
      p_audit_action => 'reservation.item_reserved'
    );
  end loop;

  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'reservation.created',
    jsonb_build_object('reservation_id', v_reservation_id, 'conversation_id', p_conversation_id), 'AI');

  return v_reservation_id;
end;
$$;

-- Válvula de segurança: a IA pode devolver a conversa para um humano a
-- qualquer momento (fora de dúvida, reclamação, pedido explícito do cliente).
create or replace function public.ai_escalate_conversation(p_conversation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'conversation_id';
  end if;
  perform private.require_ai_service_call(v_conversation.tenant_id);

  update public.conversations set status = 'HUMAN_ACTIVE' where id = p_conversation_id;
  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'conversation.escalated_by_ai',
    jsonb_build_object('conversation_id', p_conversation_id, 'reason', p_reason), 'AI');
end;
$$;

create or replace function public.ai_upsert_conversation_state(
  p_conversation_id uuid,
  p_turn_count integer,
  p_last_tool_used text default null,
  p_draft_items jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'conversation_id';
  end if;
  perform private.require_ai_service_call(v_conversation.tenant_id);

  insert into public.ai_conversation_states (tenant_id, conversation_id, turn_count, last_tool_used, draft_items)
  values (v_conversation.tenant_id, p_conversation_id, p_turn_count, p_last_tool_used, coalesce(p_draft_items, '[]'::jsonb))
  on conflict (conversation_id) do update set
    turn_count = excluded.turn_count,
    -- turn_count é sempre atualizado, mas last_tool_used/draft_items só quando
    -- informados de novo — uma chamada que só quer registrar o turno (ex.:
    -- depois de escalar) não deve apagar o rascunho de itens em negociação.
    last_tool_used = coalesce(p_last_tool_used, public.ai_conversation_states.last_tool_used),
    draft_items = case when p_draft_items is null then public.ai_conversation_states.draft_items else p_draft_items end,
    updated_at = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- Novas conversas nascem com a IA de plantão quando o tenant a tiver ligado
-- (CREATE OR REPLACE da Fase 6: só o INSERT inicial muda — uma conversa já
-- existente nunca tem seu status mexido por uma mensagem nova chegando).
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
-- Privilégios: nenhuma função nova fica executável por anon/public por
-- default do Postgres (funções recém-criadas concedem EXECUTE a PUBLIC a
-- menos que seja revogado explicitamente — diferente de tabelas). Reexecuta
-- também o revoke geral do schema private (idempotente) para cobrir a nova
-- `require_ai_service_call`.
-- -----------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon;

revoke execute on function
  public.ai_settings_get(uuid),
  public.ai_settings_update(uuid, boolean, text, text, integer, integer),
  public.ai_usage_month_to_date(uuid),
  public.ai_message_send(uuid, text),
  public.ai_log_usage(uuid, uuid, text, integer, integer, numeric, uuid),
  public.ai_reservation_create(uuid, jsonb, timestamptz, text, text),
  public.ai_escalate_conversation(uuid, text),
  public.ai_upsert_conversation_state(uuid, integer, text, jsonb)
from public, anon;

grant execute on function
  public.ai_settings_get(uuid),
  public.ai_settings_update(uuid, boolean, text, text, integer, integer),
  public.ai_usage_month_to_date(uuid),
  public.ai_message_send(uuid, text),
  public.ai_log_usage(uuid, uuid, text, integer, integer, numeric, uuid),
  public.ai_reservation_create(uuid, jsonb, timestamptz, text, text),
  public.ai_escalate_conversation(uuid, text),
  public.ai_upsert_conversation_state(uuid, integer, text, jsonb)
to authenticated, service_role;
