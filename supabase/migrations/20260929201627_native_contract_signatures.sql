-- Public access is mediated by the server using a capability token + email OTP.
-- Neither anon nor authenticated can read signing secrets or mutate evidence.
create table public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  customer_id uuid not null references public.customers(id),
  document_id uuid not null unique references public.customer_documents(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  document_name text not null,
  signer_name text not null,
  signer_document text not null default '',
  signer_email text not null default '',
  original_path text not null,
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING','SIGNED','REVOKED')),
  token_hash text unique,
  token_cipher text,
  expires_at timestamptz,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_sent_at timestamptz,
  otp_sends integer not null default 0,
  otp_attempts integer not null default 0,
  total_attempts integer not null default 0,
  session_hash text,
  session_expires_at timestamptz,
  verified_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  signed_path text,
  signed_sha256 text,
  evidence jsonb,
  evidence_seal text,
  constraint signature_signed_complete check (status <> 'SIGNED' or
    (signed_at is not null and signed_path is not null and signed_sha256 is not null and evidence is not null and evidence_seal is not null))
);
create index contract_signatures_tenant_customer_idx on public.contract_signatures(tenant_id, customer_id);
create table public.contract_signature_events (
  id uuid primary key default gen_random_uuid(),
  signature_id uuid not null references public.contract_signatures(id),
  created_at timestamptz not null default now(),
  event text not null,
  metadata jsonb not null default '{}'::jsonb
);
create index contract_signature_events_request_idx on public.contract_signature_events(signature_id, created_at);
alter table public.contract_signatures enable row level security;
alter table public.contract_signature_events enable row level security;
revoke all on public.contract_signatures, public.contract_signature_events from public, anon, authenticated;
revoke all on public.contract_signatures, public.contract_signature_events from service_role;
grant select, insert, update on public.contract_signatures to service_role;
grant select, insert on public.contract_signature_events to service_role;

create function private.protect_contract_signature() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'SIGNED' then raise exception 'signed_document_immutable'; end if;
  if (new.tenant_id,new.customer_id,new.document_id,new.original_path,new.original_sha256,new.signer_name,new.signer_document,new.signer_email,new.created_by)
    is distinct from (old.tenant_id,old.customer_id,old.document_id,old.original_path,old.original_sha256,old.signer_name,old.signer_document,old.signer_email,old.created_by)
    then raise exception 'signature_snapshot_immutable'; end if;
  return new;
end $$;
create trigger protect_contract_signature before update on public.contract_signatures
for each row execute function private.protect_contract_signature();

create function private.audit_contract_signature() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if not exists(select 1 from public.customer_documents d where d.id=new.document_id and d.tenant_id=new.tenant_id and d.customer_id=new.customer_id)
      then raise exception 'signature_document_mismatch'; end if;
    insert into public.contract_signature_events(signature_id,event) values(new.id,'CREATED');
  elsif old.status is distinct from new.status then
    insert into public.contract_signature_events(signature_id,event,metadata) values(new.id,new.status,jsonb_build_object('expires_at',new.expires_at));
  end if;
  return new;
end $$;
create trigger audit_contract_signature after insert or update on public.contract_signatures
for each row execute function private.audit_contract_signature();

create function public.signature_issue_code(p_token_hash text,p_otp_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.contract_signatures;
begin
  select * into r from public.contract_signatures where token_hash=p_token_hash for update;
  if not found or r.status<>'PENDING' or r.expires_at<=now() then return '{"error":"unavailable"}'; end if;
  if r.otp_sends>=10 or r.total_attempts>=20 then return '{"error":"locked"}'; end if;
  if r.otp_sent_at>now()-interval '60 seconds' then return '{"error":"rate_limit"}'; end if;
  update public.contract_signatures set otp_hash=p_otp_hash,otp_sent_at=now(),otp_expires_at=now()+interval '10 minutes',
    otp_sends=otp_sends+1,otp_attempts=0 where id=r.id;
  insert into public.contract_signature_events(signature_id,event) values(r.id,'CODE_REQUESTED');
  return jsonb_build_object('ok',true,'request_id',r.id);
end $$;

create function public.signature_verify_code(p_token_hash text,p_otp_hash text,p_session_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.contract_signatures;
begin
  select * into r from public.contract_signatures where token_hash=p_token_hash for update;
  if not found or r.status<>'PENDING' or r.expires_at<=now() then return '{"error":"unavailable"}'; end if;
  if r.total_attempts>=20 or r.otp_attempts>=5 then return '{"error":"locked"}'; end if;
  if r.otp_hash is null or r.otp_expires_at<=now() then return '{"error":"invalid_code"}'; end if;
  update public.contract_signatures set otp_attempts=otp_attempts+1,total_attempts=total_attempts+1 where id=r.id;
  if r.otp_hash<>p_otp_hash then
    insert into public.contract_signature_events(signature_id,event) values(r.id,'INVALID_CODE');
    return '{"error":"invalid_code"}';
  end if;
  update public.contract_signatures set otp_hash=null,session_hash=p_session_hash,
    session_expires_at=least(now()+interval '30 minutes',expires_at),verified_at=now(),viewed_at=null where id=r.id;
  insert into public.contract_signature_events(signature_id,event) values(r.id,'EMAIL_VERIFIED');
  return '{"ok":true}';
end $$;

create function public.signature_complete(p_token_hash text,p_session_hash text,p_signed_path text,p_signed_sha256 text,p_evidence jsonb,p_seal text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.contract_signatures;
begin
  select * into r from public.contract_signatures where token_hash=p_token_hash for update;
  if not found or r.status<>'PENDING' or r.expires_at<=now() then return '{"error":"unavailable"}'; end if;
  if r.session_hash is null or r.session_hash<>p_session_hash or r.session_expires_at<=now() or r.viewed_at is null
    then return '{"error":"verification_required"}'; end if;
  if p_evidence->>'originalSha256' is distinct from r.original_sha256 or p_evidence->>'requestId' is distinct from r.id::text
    or p_evidence->>'signerName' is distinct from r.signer_name or p_evidence->>'accepted' is distinct from 'true'
    or p_evidence->>'consentVersion' is distinct from '2026-09-29-v1'
    or p_signed_sha256 !~ '^[a-f0-9]{64}$' or p_seal !~ '^[a-f0-9]{64}$'
    or p_signed_path not like r.tenant_id::text||'/'||r.id::text||'/%'
    then return '{"error":"invalid_evidence"}'; end if;
  update public.contract_signatures set status='SIGNED',signed_at=now(),signed_path=p_signed_path,signed_sha256=p_signed_sha256,
    evidence=p_evidence,evidence_seal=p_seal,otp_hash=null where id=r.id;
  return '{"ok":true}';
end $$;

revoke all on function public.signature_issue_code(text,text),public.signature_verify_code(text,text,text),public.signature_complete(text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.signature_issue_code(text,text),public.signature_verify_code(text,text,text),public.signature_complete(text,text,text,text,jsonb,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('contract-signatures','contract-signatures',false,15728640,array['application/pdf']) on conflict(id) do nothing;
-- No browser roles get any policies for this bucket. All serving is verified server-side.
