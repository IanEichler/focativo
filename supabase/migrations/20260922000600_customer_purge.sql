-- =============================================================================
-- Exclusão de verdade de cliente (pedido explícito do usuário, depois de
-- descobrir que a trava de auditoria bloqueava sempre): abre uma exceção
-- ESTREITA e escopada, nunca uma remoção geral da garantia append-only.
--
-- O que muda: private.prevent_mutation() passa a permitir DELETE em
-- messages/timeline_events (só essas duas tabelas, nunca audit_logs,
-- platform_audit_logs, stock_movements, ai_usage_events etc.) quando a
-- variável de sessão app.allow_customer_purge estiver 'on'. Essa variável só
-- é setada dentro de customer_purge, via set_config(..., true) — o `true`
-- final é is_local: o valor vale só até o fim da transação atual e nunca
-- vaza pra outras sessões/transações concorrentes.
--
-- O que continua bloqueado: reservations/payments/agenda_appointments têm FK
-- em RESTRICT (não CASCADE) — um cliente com reserva, cobrança ou
-- agendamento real ainda impede a exclusão, propositalmente. São registros
-- de negócio de verdade (não só histórico de conversa); apagar um cliente
-- com vendas/reservas quebraria o financeiro. Só quem não tem nenhum
-- rastro comercial (no máximo mensagens/timeline) pode ser excluído de
-- verdade agora — o resto continua exigindo arquivar.
-- =============================================================================

create or replace function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name in ('messages', 'timeline_events')
     and coalesce(current_setting('app.allow_customer_purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'append_only' using errcode = '42501', detail = tg_table_name;
end;
$$;

create or replace function public.customer_purge(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  perform private.require_user();
  select tenant_id into v_tenant_id from public.customers where id = p_customer_id;
  if v_tenant_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_tenant_id, 'customers.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform set_config('app.allow_customer_purge', 'on', true);
  delete from public.customers where id = p_customer_id and tenant_id = v_tenant_id;
end;
$$;

revoke all on function public.customer_purge(uuid) from public, anon;
grant execute on function public.customer_purge(uuid) to authenticated, service_role;
