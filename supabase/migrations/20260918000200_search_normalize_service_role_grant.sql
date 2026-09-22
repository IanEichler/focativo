-- =============================================================================
-- FASE 7 · correção: private.search_normalize faltava EXECUTE para service_role
--
-- `private.search_normalize` (Fase 2) só tinha `grant ... to authenticated` —
-- suficiente enquanto só sessões de staff autenticado chamavam
-- `catalog_search_variants` (que NÃO é security definer, então roda com o
-- privilégio de quem chamou). A tool `buscar_produtos` da IA (Fase 7) é a
-- primeira a chamar essa busca como service_role (sem sessão de usuário,
-- disparada pelo webhook), e esbarrou em "permission denied for function
-- search_normalize" — pego ao vivo contra o Supabase Cloud, não pela suíte
-- local (o harness de testes nunca tinha exercitado esse caminho). Função
-- pura de normalização de texto (lower + unaccent), sem acesso a dados —
-- conceder para service_role não abre superfície nova nenhuma.
-- =============================================================================

grant execute on function private.search_normalize(text) to service_role;
