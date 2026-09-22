-- =============================================================================
-- Trava de defesa em profundidade: o módulo "ai" desligado pelo admin master
-- (tenant_module_flags) bloqueia a IA mesmo que o dono do tenant tenha
-- tenant_ai_settings.enabled = true — o admin master de plataforma tem a
-- palavra final sobre o que o plano do tenant inclui, não só a navegação.
-- CREATE OR REPLACE da Fase 7 (private.require_ai_service_call já pushada):
-- mesma assinatura/retorno, só acrescenta a checagem do módulo.
-- =============================================================================

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
  if exists (
    select 1 from public.tenant_module_flags
    where tenant_id = p_tenant_id and module_code = 'ai' and not enabled
  ) then
    raise exception 'ai_disabled' using errcode = '42501', detail = 'module_disabled_by_platform';
  end if;
end;
$$;
