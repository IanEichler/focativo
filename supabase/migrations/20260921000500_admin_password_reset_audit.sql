-- =============================================================================
-- Trilha de auditoria para o admin master redefinir a senha de um usuário.
-- A troca em si acontece pela Admin API do Supabase Auth (fora do banco) —
-- esta RPC só registra o evento na trilha da plataforma, mesmo padrão de
-- admin_set_tenant_status/admin_create_tenant.
-- =============================================================================

create or replace function public.admin_log_password_reset(p_target_user_id uuid, p_tenant_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  perform private.log_platform_audit(
    'user.password_reset_by_admin', p_tenant_id, 'profile', p_target_user_id::text,
    'Senha redefinida pelo admin master', null, null
  );
end;
$$;

revoke all on all functions in schema private from public, anon;
revoke execute on function public.admin_log_password_reset(uuid, uuid) from public, anon;
grant execute on function public.admin_log_password_reset(uuid, uuid) to authenticated, service_role;
