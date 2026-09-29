-- Bearer links now grant access without email verification. Keep the original
-- method on completed signatures and leave their evidence/PDFs unchanged.
alter table public.contract_signatures add column authentication_method text not null
  default 'email_otp' check (authentication_method in ('email_otp','unique_link'));
alter table public.contract_signatures alter column authentication_method set default 'unique_link';
update public.contract_signatures set authentication_method='unique_link',
  otp_hash=null,session_hash=null,session_expires_at=null,verified_at=null,viewed_at=null
where status<>'SIGNED';

create function public.signature_complete_link(p_token_hash text,p_signed_path text,p_signed_sha256 text,p_evidence jsonb,p_seal text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.contract_signatures;
begin
  select * into r from public.contract_signatures where token_hash=p_token_hash for update;
  if not found or r.status<>'PENDING' or r.authentication_method<>'unique_link'
    or r.expires_at is null or r.expires_at<=now() then return '{"error":"unavailable"}'; end if;
  if r.viewed_at is null then return '{"error":"review_required"}'; end if;
  if p_evidence->>'originalSha256' is distinct from r.original_sha256
    or p_evidence->>'requestId' is distinct from r.id::text
    or p_evidence->>'signerName' is distinct from r.signer_name
    or p_evidence->>'accepted' is distinct from 'true'
    or p_evidence->>'authentication' is distinct from 'unique_link'
    or p_evidence->>'consentVersion' is distinct from '2026-09-29-v2-link'
    or p_evidence ? 'verifiedAt'
    or p_signed_sha256 is null or p_signed_sha256 !~ '^[a-f0-9]{64}$'
    or p_seal is null or p_seal !~ '^[a-f0-9]{64}$'
    or p_signed_path is null or p_signed_path not like r.tenant_id::text||'/'||r.id::text||'/%'
    then return '{"error":"invalid_evidence"}'; end if;
  update public.contract_signatures set status='SIGNED',signed_at=now(),signed_path=p_signed_path,
    signed_sha256=p_signed_sha256,evidence=p_evidence,evidence_seal=p_seal,otp_hash=null where id=r.id;
  return '{"ok":true}';
end $$;
revoke all on function public.signature_complete_link(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.signature_complete_link(text,text,text,jsonb,text) to service_role;
