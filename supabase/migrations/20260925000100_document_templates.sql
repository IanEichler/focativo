-- =============================================================================
-- Preenchimento automático de documentos: biblioteca de modelos .docx
-- (document_templates) + documentos gerados e salvos no perfil de um cliente
-- (customer_documents). Os arquivos em si vivem em dois buckets NOVOS e
-- PRIVADOS do Storage (ao contrário do product-images, que é público —
-- contrato é documento sensível), servidos por URL assinada.
-- =============================================================================

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  file_path text not null,
  -- Cache dos placeholders "{{campo}}" descobertos no upload (evita reabrir o
  -- .docx toda vez só pra saber quais campos o formulário de geração precisa).
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_tenant_id_id_key unique (tenant_id, id)
);

create index document_templates_tenant_active_idx on public.document_templates (tenant_id) where is_active;

create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  template_id uuid references public.document_templates (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  file_path text not null,
  generated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index customer_documents_tenant_customer_idx on public.customer_documents (tenant_id, customer_id, created_at desc);

create trigger document_templates_set_updated_at before update on public.document_templates
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('documents.read', 'documents', 'Ver modelos de documento e documentos gerados'),
  ('documents.write', 'documents', 'Subir modelos e gerar/salvar documentos para clientes');

insert into public.role_permissions (role_code, permission_code)
select r.code, p.code
from public.roles r
cross join unnest(array['documents.read', 'documents.write']) as p(code)
where r.code in ('OWNER', 'ADMIN', 'GERENTE', 'VENDEDOR');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.document_templates enable row level security;
alter table public.customer_documents enable row level security;

create policy document_templates_select on public.document_templates for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('documents.read')));
create policy customer_documents_select on public.customer_documents for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('documents.read')));

revoke all on public.document_templates, public.customer_documents from anon, authenticated;
grant select on public.document_templates, public.customer_documents to authenticated;
grant all on public.document_templates, public.customer_documents to service_role;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

create or replace function public.document_template_create(
  p_tenant_id uuid,
  p_name text,
  p_file_path text,
  p_fields jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_id uuid;
begin
  if not private.has_tenant_permission(p_tenant_id, 'documents.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fields) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'fields';
  end if;

  insert into public.document_templates (tenant_id, name, file_path, fields, created_by)
  values (p_tenant_id, btrim(p_name), p_file_path, p_fields, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.document_template_archive(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.document_templates where id = p_template_id;
  if v_tenant_id is null then
    raise exception 'not_found' using errcode = 'P0002', detail = 'template_id';
  end if;
  if not private.has_tenant_permission(v_tenant_id, 'documents.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.document_templates set is_active = false where id = p_template_id;
end;
$$;

create or replace function public.customer_document_create(
  p_customer_id uuid,
  p_template_id uuid,
  p_name text,
  p_file_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_tenant_id uuid;
  v_id uuid;
begin
  select tenant_id into v_tenant_id from public.customers where id = p_customer_id and archived_at is null;
  if v_tenant_id is null then
    raise exception 'not_found' using errcode = 'P0002', detail = 'customer_id';
  end if;
  if not private.has_tenant_permission(v_tenant_id, 'documents.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.customer_documents (tenant_id, customer_id, template_id, name, file_path, generated_by)
  values (v_tenant_id, p_customer_id, p_template_id, btrim(p_name), p_file_path, v_uid)
  returning id into v_id;

  perform private.log_timeline_event(v_tenant_id, p_customer_id, 'customer.document_generated',
    jsonb_build_object('customer_document_id', v_id, 'name', btrim(p_name)));

  return v_id;
end;
$$;

revoke all on function public.document_template_create(uuid, text, text, jsonb) from public, anon;
revoke all on function public.document_template_archive(uuid) from public, anon;
revoke all on function public.customer_document_create(uuid, uuid, text, text) from public, anon;
grant execute on function public.document_template_create(uuid, text, text, jsonb) to authenticated;
grant execute on function public.document_template_archive(uuid) to authenticated;
grant execute on function public.customer_document_create(uuid, uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: dois buckets privados, mesma convenção de pasta <tenant_id>/... do
-- product-images (20260917000700_catalog_views_search_storage.sql), mas com
-- public=false — contrato é documento sensível, nunca servido por URL pública
-- direta (o app gera URL assinada de curta duração na hora do download).
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-templates', 'document-templates', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-documents', 'customer-documents', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy document_templates_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'document-templates'
    and (storage.foldername(name))[1] in (select t::text from private.readable_tenant_ids_with_permission('documents.read') t)
  );
create policy document_templates_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'document-templates'
    and (storage.foldername(name))[1] in (select t::text from private.tenant_ids_with_permission('documents.write') t)
  );
create policy document_templates_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'document-templates'
    and (storage.foldername(name))[1] in (select t::text from private.tenant_ids_with_permission('documents.write') t)
  );

create policy customer_documents_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] in (select t::text from private.readable_tenant_ids_with_permission('documents.read') t)
  );
create policy customer_documents_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] in (select t::text from private.tenant_ids_with_permission('documents.write') t)
  );
create policy customer_documents_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] in (select t::text from private.tenant_ids_with_permission('documents.write') t)
  );
