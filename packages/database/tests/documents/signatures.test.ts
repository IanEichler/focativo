import { beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { useTestDatabase } from "../../src/harness/test-db";

const db = useTestDatabase();
let tenantId: string;
let ownerId: string;
beforeAll(async () => { ({ tenantId, ownerId } = await db.createTenantWithOwner("Assinaturas")); });
async function request() {
  const [customer] = await db.admin.query<{ id: string }>("insert into public.customers(tenant_id,name,email) values($1,'Signatária teste','signer@example.test') returning id", [tenantId]);
  const [document] = await db.as(ownerId).rpc<{ customer_document_create: string }>("customer_document_create", {
    p_customer_id: customer!.id, p_template_id: null, p_name: "Teste.docx", p_file_path: `${tenantId}/test.docx`,
  });
  const token = randomUUID();
  const [row] = await db.service.query<{ id: string }>(`insert into public.contract_signatures(tenant_id,customer_id,document_id,created_by,document_name,signer_name,signer_email,original_path,original_sha256,status,token_hash,expires_at)
    values($1,$2,$3,$4,'Teste.pdf','Signatária teste','signer@example.test','original.pdf',$5,'PENDING',$6,now()+interval '7 days') returning id`,
    [tenantId, customer!.id, document!.customer_document_create, ownerId, "a".repeat(64), token]);
  return { id: row!.id, token };
}
async function issue(token: string) {
  const [row] = await db.service.rpc("signature_issue_code", { p_token_hash: token, p_otp_hash: "correct" });
  return row!.signature_issue_code;
}
async function verify(token: string, code = "correct") {
  const [row] = await db.service.rpc("signature_verify_code", { p_token_hash: token, p_otp_hash: code, p_session_hash: "session" });
  return row!.signature_verify_code;
}
async function complete(id: string, token: string, session = "session", original = "a".repeat(64)) {
  const [row] = await db.service.rpc("signature_complete", {
    p_token_hash: token, p_session_hash: session, p_signed_path: `${tenantId}/${id}/signed.pdf`, p_signed_sha256: "b".repeat(64), p_seal: "c".repeat(64),
    p_evidence: JSON.stringify({ requestId: id, originalSha256: original, signerName: "Signatária teste", accepted: true, consentVersion: "2026-09-29-v1" }),
  });
  return row!.signature_complete;
}
it("denies direct browser access to signing data, evidence and RPCs", async () => {
  const r = await request();
  for (const session of [db.anon, db.as(ownerId)]) {
    await expect(session.query("select * from public.contract_signatures")).rejects.toThrow("permission denied");
    await expect(session.query("select * from public.contract_signature_events")).rejects.toThrow("permission denied");
    await expect(session.rpc("signature_issue_code", { p_token_hash: r.token, p_otp_hash: "x" })).rejects.toThrow("permission denied");
  }
});
it("serializes concurrent code sends and enforces cooldown", async () => {
  const r = await request();
  const results = await Promise.all([issue(r.token), issue(r.token)]);
  expect(results).toContainEqual(expect.objectContaining({ ok: true }));
  expect(results).toContainEqual({ error: "rate_limit" });
});
it("counts incorrect guesses and locks after five attempts", async () => {
  const r = await request(); await issue(r.token);
  for (let n=0; n<5; n++) expect(await verify(r.token, "wrong")).toEqual({ error: "invalid_code" });
  expect(await verify(r.token)).toEqual({ error: "locked" });
});
it("enforces expiry, single-use codes and verified session before signing", async () => {
  const r = await request();
  expect(await complete(r.id,r.token)).toEqual({ error: "verification_required" });
  await issue(r.token);
  await db.admin.query("update public.contract_signatures set otp_expires_at=now()-interval '1 second' where id=$1", [r.id]);
  expect(await verify(r.token)).toEqual({ error: "invalid_code" });
  await db.admin.query("update public.contract_signatures set otp_expires_at=now()+interval '1 minute' where id=$1", [r.id]);
  expect(await verify(r.token)).toEqual({ ok: true });
  expect(await verify(r.token)).toEqual({ error: "invalid_code" });
  expect(await complete(r.id,r.token)).toEqual({ error: "verification_required" });
  await db.service.query("update public.contract_signatures set viewed_at=now() where id=$1", [r.id]);
  expect(await complete(r.id,r.token,"forged")).toEqual({ error: "verification_required" });
  expect(await complete(r.id,r.token,"session","d".repeat(64))).toEqual({ error: "invalid_evidence" });
});
it("records one signature atomically and makes the signed snapshot immutable", async () => {
  const r = await request(); await issue(r.token); await verify(r.token);
  await db.service.query("update public.contract_signatures set viewed_at=now() where id=$1", [r.id]);
  const results = await Promise.all([complete(r.id,r.token), complete(r.id,r.token)]);
  expect(results).toContainEqual({ ok: true }); expect(results).toContainEqual({ error: "unavailable" });
  await expect(db.service.query("update public.contract_signatures set signer_name='Modified' where id=$1", [r.id])).rejects.toThrow("signed_document_immutable");
  await expect(db.service.query("delete from public.contract_signature_events where signature_id=$1", [r.id])).rejects.toThrow("permission denied");
  const events = await db.service.query("select event from public.contract_signature_events where signature_id=$1", [r.id]);
  expect(events.filter(e=>e.event==='SIGNED')).toHaveLength(1);
});
it("rejects revoked and expired links and blocks snapshot edits", async () => {
  const r = await request();
  await expect(db.service.query("update public.contract_signatures set original_sha256=$2 where id=$1", [r.id,"c".repeat(64)])).rejects.toThrow("signature_snapshot_immutable");
  await db.service.query("update public.contract_signatures set status='REVOKED' where id=$1", [r.id]);
  expect(await issue(r.token)).toEqual({ error: "unavailable" });
  const expired = await request();
  await db.service.query("update public.contract_signatures set expires_at=now()-interval '1 minute' where id=$1", [expired.id]);
  expect(await issue(expired.token)).toEqual({ error: "unavailable" });
});

async function completeLink(id: string, token: string, changes = {}) {
  const [row] = await db.service.rpc("signature_complete_link", {
    p_token_hash: token, p_signed_path: `${tenantId}/${id}/signed.pdf`, p_signed_sha256: "b".repeat(64), p_seal: "c".repeat(64),
    p_evidence: JSON.stringify({ requestId: id, originalSha256: "a".repeat(64), signerName: "Signatária teste", accepted: true,
      authentication: "unique_link", consentVersion: "2026-09-29-v2-link", ...changes }),
  });
  return row!.signature_complete_link;
}
it("signs by link without email verification but requires PDF access and accurate evidence", async () => {
  const r = await request();
  expect(await completeLink(r.id, r.token)).toEqual({ error: "review_required" });
  await db.service.query("update public.contract_signatures set viewed_at=now() where id=$1", [r.id]);
  expect(await completeLink(r.id, r.token, { verifiedAt: "2026-09-29" })).toEqual({ error: "invalid_evidence" });
  expect(await completeLink(r.id, r.token, { authentication: "email_otp" })).toEqual({ error: "invalid_evidence" });
  expect(await completeLink(r.id, r.token, { accepted: false })).toEqual({ error: "invalid_evidence" });
  const results = await Promise.all([completeLink(r.id, r.token), completeLink(r.id, r.token)]);
  expect(results).toContainEqual({ ok: true }); expect(results).toContainEqual({ error: "unavailable" });
  const [saved] = await db.service.query("select verified_at,authentication_method,evidence from public.contract_signatures where id=$1", [r.id]);
  expect(saved!.verified_at).toBeNull(); expect(saved!.authentication_method).toBe("unique_link");
  expect(saved!.evidence).not.toHaveProperty("verifiedAt");
  await expect(db.service.query("update public.contract_signatures set authentication_method='email_otp' where id=$1", [r.id])).rejects.toThrow("signed_document_immutable");
});
it("blocks expired/revoked links and direct browser signing RPC access", async () => {
  for (const status of ["REVOKED", "PENDING"]) {
    const r = await request();
    await db.service.query("update public.contract_signatures set viewed_at=now(),status=$2,expires_at=now()-interval '1 second' where id=$1", [r.id, status]);
    expect(await completeLink(r.id, r.token)).toEqual({ error: "unavailable" });
  }
  for (const session of [db.anon, db.as(ownerId)]) {
    await expect(session.query("select public.signature_complete_link('x','x','x','{}'::jsonb,'x')")).rejects.toThrow("permission denied");
  }
});
