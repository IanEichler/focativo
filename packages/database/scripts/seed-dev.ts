/**
 * Seed de DESENVOLVIMENTO (Fase 1): empresa fictícia "Gorila Suplementos" com
 * um usuário por papel. Usa os mesmos fluxos da aplicação (RPCs com a
 * identidade de cada usuário), então valida RLS/RBAC de ponta a ponta.
 *
 *   pnpm --filter @estoque-ia/database seed:dev -- --confirm
 *
 * NUNCA rodar em produção. Idempotente: pode ser executado mais de uma vez.
 * Produtos, estoque, clientes, conversas, reservas e vendas entram no seed à
 * medida que cada módulo é implementado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient, findUserIdByEmail, loadWebEnv, requireEnv } from "./lib/supabase-env";

const TENANT_NAME = "Gorila Suplementos";

const USERS = [
  { email: "owner@gorila.dev", fullName: "Olívia Proprietária", role: "OWNER" },
  { email: "admin@gorila.dev", fullName: "André Administrador", role: "ADMIN" },
  { email: "gerente@gorila.dev", fullName: "Gabriela Gerente", role: "GERENTE" },
  { email: "vendedor@gorila.dev", fullName: "Vitor Vendedor", role: "VENDEDOR" },
] as const;

async function ensureUser(admin: SupabaseClient, email: string, fullName: string, password: string) {
  const existing = await findUserIdByEmail(admin, email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signedIn(email: string, password: string) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

async function main() {
  loadWebEnv();
  if (!process.argv.includes("--confirm")) {
    console.error("Seed de desenvolvimento. Confirme com --confirm (nunca em produção).");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    console.error("Recusado: ambiente de produção.");
    process.exit(1);
  }

  const password = requireEnv("SEED_DEV_PASSWORD");
  const admin = adminClient();

  for (const user of USERS) {
    await ensureUser(admin, user.email, user.fullName, password);
  }

  const owner = await signedIn(USERS[0].email, password);
  const { data: memberships } = await owner.from("tenant_users").select("tenant_id, tenant:tenants!inner(name)");
  let tenantId = (memberships ?? []).find((row) => (row.tenant as unknown as { name: string }).name === TENANT_NAME)
    ?.tenant_id as string | undefined;

  if (!tenantId) {
    const { data, error } = await owner.rpc("create_tenant", { p_name: TENANT_NAME, p_segment: "supplements" });
    if (error) throw new Error(`create_tenant: ${error.message}`);
    tenantId = data as string;
    await owner
      .from("tenants")
      .update({ legal_name: "Gorila Suplementos LTDA (fictícia)", phone: "11999990000" })
      .eq("id", tenantId);
    console.log(`Empresa criada: ${TENANT_NAME}`);
  }

  for (const user of USERS.slice(1)) {
    const { error } = await owner.rpc("invite_tenant_user", {
      p_tenant_id: tenantId,
      p_email: user.email,
      p_role_code: user.role,
    });
    if (error && error.message !== "already_member") throw new Error(`invite ${user.email}: ${error.message}`);
    const member = await signedIn(user.email, password);
    const { error: acceptError } = await member.rpc("accept_tenant_invitation", { p_tenant_id: tenantId });
    if (acceptError && acceptError.message !== "not_found") {
      throw new Error(`accept ${user.email}: ${acceptError.message}`);
    }
  }

  console.log("Seed concluído. Contas (senha em SEED_DEV_PASSWORD):");
  for (const user of USERS) console.log(`  ${user.role.padEnd(9)} ${user.email}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
