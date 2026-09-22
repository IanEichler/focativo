/**
 * Processo PM2 isolado (Fase 8) para tarefas que antes só rodavam quando
 * alguém abria a página certa — ex.: reservas vencidas só expiravam quando
 * um humano abria /app/reservas (reservations_expire_due). Isso deixava
 * estoque reservado preso indefinidamente se ninguém abrisse a tela.
 *
 * Isolado do app Next.js de propósito (mesmo padrão do services/whatsapp,
 * Fase 6): se este processo cair ou travar, estoque/vendas/CRM continuam
 * no ar normalmente — ele só chama RPCs já protegidas por auth.uid() IS
 * NULL (só service_role pode chamar), nunca lê nem escreve direto em tabela.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runReservationsExpireSweep(): Promise<void> {
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("reservations_expire_due_sweep");
  const durationMs = Date.now() - startedAt;

  if (error) {
    console.error(
      JSON.stringify({
        event: "job.reservations_expire_due_sweep",
        status: "error",
        error: error.message,
        duration_ms: durationMs,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: "job.reservations_expire_due_sweep",
      status: "ok",
      expired_count: data,
      duration_ms: durationMs,
    }),
  );
}

async function tick(): Promise<void> {
  await runReservationsExpireSweep();
  setTimeout(() => void tick(), config.intervalMinutes * 60_000);
}

console.log(JSON.stringify({ event: "jobs.started", interval_minutes: config.intervalMinutes }));
void tick();
