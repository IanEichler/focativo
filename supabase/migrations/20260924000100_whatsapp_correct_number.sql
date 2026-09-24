-- =============================================================================
-- Correção assíncrona do telefone: no primeiro contato de um cliente novo,
-- se a resolução do LID falhar mesmo com retry, o cliente nasce com o
-- fallback (dígitos crus do pseudo-ID). Até aqui, só uma SEGUNDA mensagem
-- desse contato corrigia isso (whatsapp_receive_message já faz upgrade
-- quando o número novo parece melhor) — mas um cliente que manda só uma
-- mensagem nunca era corrigido.
--
-- services/whatsapp agora tenta de novo em segundo plano, ~12s depois do
-- primeiro contato (dá tempo da lib sincronizar o LID), e chama esta RPC se
-- conseguir um número melhor — sem criar mensagem nem tocar em nada além do
-- telefone. Mesma regra de "só atualiza se parecer melhor" de
-- whatsapp_receive_message, nunca degrada um número já bom.
-- =============================================================================

create or replace function public.whatsapp_correct_number(
  p_tenant_id uuid,
  p_whatsapp_chat_id text,
  p_whatsapp_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_customer_id uuid;
begin
  select id, whatsapp into v_customer_id, v_current from public.customers
  where tenant_id = p_tenant_id and whatsapp_chat_id = p_whatsapp_chat_id and archived_at is null;
  if v_customer_id is null then
    return;
  end if;

  if p_whatsapp_number is distinct from v_current
     and char_length(p_whatsapp_number) <= 13
     and (v_current is null or char_length(v_current) > 13)
     and not exists (
       select 1 from public.customers
       where tenant_id = p_tenant_id and whatsapp = p_whatsapp_number and archived_at is null and id <> v_customer_id
     )
  then
    update public.customers set whatsapp = p_whatsapp_number where id = v_customer_id;
  end if;
end;
$$;

revoke all on function public.whatsapp_correct_number(uuid, text, text) from public, anon;
grant execute on function public.whatsapp_correct_number(uuid, text, text) to authenticated, service_role;
