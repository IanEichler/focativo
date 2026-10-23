-- O sistema passou a ser de uso exclusivo de uma clínica em Cuiabá (MT, UTC-4,
-- sem horário de verão). Agenda, sessões do contrato e horário de
-- funcionamento leem tenants.timezone; os fallbacks em SQL para tenant sem
-- fuso nunca disparam, porque a coluna é not null.
alter table public.tenants alter column timezone set default 'America/Cuiaba';
update public.tenants set timezone = 'America/Cuiaba' where timezone <> 'America/Cuiaba';
