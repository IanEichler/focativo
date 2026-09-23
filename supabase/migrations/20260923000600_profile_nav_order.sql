-- =============================================================================
-- Ordem do menu lateral por usuário: arrastar-pra-reordenar dentro de cada
-- seção. Persistência é uma coluna em profiles, não tabela/RPC nova — mesmo
-- padrão já usado no projeto (update direto de coluna própria via server
-- action, RLS já cobre "só o dono edita seu perfil").
-- =============================================================================

alter table public.profiles add column nav_order jsonb;

grant update (full_name, phone, avatar_url, nav_order) on public.profiles to authenticated;
