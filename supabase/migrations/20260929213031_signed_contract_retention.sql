-- Signed records and their source document remain immutable even through server code.
create function private.retain_signed_contract() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'contract_signatures' then
    if old.status = 'SIGNED' then raise exception 'signed_document_immutable'; end if;
  elsif exists (select 1 from public.contract_signatures s where s.document_id = old.id and s.status = 'SIGNED') then
    raise exception 'signed_document_immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.retain_signed_contract() from public, anon, authenticated;
create trigger retain_signed_signature before delete on public.contract_signatures
  for each row execute function private.retain_signed_contract();
create trigger retain_signed_customer_document before update or delete on public.customer_documents
  for each row execute function private.retain_signed_contract();

-- Only orphaned uploads may be cleaned up by a browser; stored documents are retained.
create function private.customer_document_file_is_retained(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.customer_documents d where d.file_path = p_path);
$$;
revoke all on function private.customer_document_file_is_retained(text) from public, anon;
grant execute on function private.customer_document_file_is_retained(text) to authenticated;
drop policy customer_documents_bucket_delete on storage.objects;
create policy customer_documents_bucket_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] in (select t::text from private.tenant_ids_with_permission('documents.write') t)
    and not private.customer_document_file_is_retained(name)
  );
