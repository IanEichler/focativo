/**
 * Concede SUPER_ADMIN a uma conta existente.
 *
 *   pnpm --filter @estoque-ia/database admin:grant -- dono@plataforma.com "motivo"
 *
 * Só funciona com a SUPABASE_SECRET_KEY (service role). Não existe caminho pela
 * interface nem pelas RPCs para conceder este papel.
 */
import { adminClient, findUserIdByEmail, loadWebEnv } from "./lib/supabase-env";

async function main() {
  loadWebEnv();
  const [email, ...noteParts] = process.argv.slice(2).filter((arg) => arg !== "--");
  if (!email) {
    console.error('Uso: admin:grant -- <email> "<motivo>"');
    process.exit(1);
  }

  const admin = adminClient();
  const userId = await findUserIdByEmail(admin, email);
  if (!userId) {
    console.error(`Nenhuma conta encontrada para ${email}. A pessoa precisa se cadastrar antes.`);
    process.exit(1);
  }

  const { error } = await admin
    .from("platform_admins")
    .upsert({ user_id: userId, note: noteParts.join(" ") || "Concedido via script" }, { onConflict: "user_id" });

  if (error) {
    console.error("Falha ao conceder SUPER_ADMIN:", error.message);
    process.exit(1);
  }
  console.log(`SUPER_ADMIN concedido a ${email}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
