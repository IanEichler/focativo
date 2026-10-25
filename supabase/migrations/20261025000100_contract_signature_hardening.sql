-- Endurece o que os guardas de esquema apontavam nas assinaturas de contrato.
--
-- 1. As funções de gatilho nasceram com EXECUTE para PUBLIC (padrão do
--    Postgres). Não eram exploráveis — função de gatilho só roda como gatilho e
--    o Postgres confere EXECUTE na criação do gatilho, não quando ele dispara —
--    mas ficam revogadas como todas as outras.
-- 2. contract_signatures já negava tudo à API (RLS ligada, sem policy e sem
--    GRANT para authenticated): só o serviço de assinatura (service_role) lê e
--    escreve. A policy abaixo só torna isso explícito; não libera nada.

revoke all on function private.protect_contract_signature(), private.audit_contract_signature()
  from public, anon, authenticated;

create policy contract_signatures_service_only on public.contract_signatures
  as restrictive for all to authenticated, anon
  using (false)
  with check (false);
