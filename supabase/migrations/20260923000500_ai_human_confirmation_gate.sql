-- =============================================================================
-- Gate de confirmação humana: quando agenda_services.requires_human_confirmation
-- é true, a IA nunca finaliza esse agendamento sozinha na PRIMEIRA tentativa —
-- precisa de uma rodada de revisão humana antes. A IA continua sendo quem
-- efetivamente cria o compromisso, só que só depois de liberada.
--
-- Mecanismo (reaproveita o handoff que já existe, nada novo):
--  1. ai_agenda_book vê requires_human_confirmation=true, não encontra um
--     draft já liberado, e recusa com 'human_confirmation_required' — SEM
--     escrever nada aqui dentro: um RAISE não capturado desfaz a transação
--     inteira, inclusive qualquer INSERT/UPDATE feito antes dele na mesma
--     chamada. Por isso quem grava o marcador é uma chamada separada, já
--     depois que esta transação (que falhou de propósito) terminou.
--  2. tool-executor.ts, ao capturar esse erro, grava o marcador via
--     ai_upsert_conversation_state (RPC já existente, chamada própria = sua
--     própria transação) e escala a conversa (mesma tool escalar_para_humano).
--  3. Atendente assume o ticket (conversation_assume, já existe), avalia, e
--     devolve à IA (conversation_return_to_ai, já existe) — esse retorno é o
--     "pode agendar": marca o draft como liberado.
--  4. Próxima mensagem do cliente aciona a IA de novo; ai_agenda_book acha o
--     draft liberado, cria o compromisso de verdade e limpa o marcador.
--
-- draft_items nunca foi escrito por nada até agora (só lido/comentado como
-- "rascunho de itens em negociação") — livre pra usar sem colidir com outra
-- feature.
-- =============================================================================

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
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'conversation_id';
  end if;
  perform private.require_ai_service_call(v_conversation.tenant_id);

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

  -- O gesto de devolver à IA depois de assumir o ticket É a liberação do
  -- agendamento pendente, quando houver um.
  update public.ai_conversation_states
  set draft_items = jsonb_build_array(jsonb_build_object('type', 'appointment_pending', 'human_cleared', true))
  where conversation_id = p_conversation_id
    and jsonb_path_exists(draft_items, '$[*] ? (@.type == "appointment_pending")');

  perform private.log_timeline_event(v_conversation.tenant_id, v_conversation.customer_id, 'conversation.returned_to_ai',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;
