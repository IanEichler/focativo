-- Foto de perfil do cliente (hoje só populada a partir do WhatsApp, via
-- getContact do provider — genérica o bastante pra outros canais no futuro).
alter table public.customers add column avatar_url text
  check (avatar_url is null or char_length(avatar_url) <= 2048);

-- (Exclusão de cliente foi pedida, mas investigada e descartada: todo
-- cliente já nasce com um evento append-only na timeline (customer.created,
-- trigger customers_insert_timeline), então uma exclusão de verdade sempre
-- cascateia numa tentativa de apagar registro de auditoria — o banco recusa
-- sempre, sem exceção nenhuma, nem para um cliente recém-criado e vazio.
-- Decisão confirmada com o usuário: manter a garantia "histórico nunca é
-- apagado" e oferecer arquivar em vez de excluir de verdade.)
grant update (name, phone, whatsapp, email, document, birthday, notes, tags, origin, responsible_user_id, archived_at, avatar_url)
  on public.customers to authenticated;
