-- =============================================================================
-- Terceiro provider de IA (OpenAI/GPT), mesma tabela admin-master-only de
-- modelo/limites (tenant_ai_platform_limits) — só amplia o check de provider,
-- nenhuma coluna nova (mesmo padrão do Gemini em 20260924000300).
-- =============================================================================

alter table public.tenant_ai_platform_limits
  drop constraint tenant_ai_platform_limits_provider_check,
  add constraint tenant_ai_platform_limits_provider_check check (provider in ('anthropic', 'gemini', 'openai'));
