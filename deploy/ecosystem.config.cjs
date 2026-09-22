/**
 * PM2 — produção em VPS Linux (sem Docker).
 *
 *   pnpm approve-builds        # confirmar o build do puppeteer (baixa o Chromium)
 *   pnpm install --frozen-lockfile && pnpm build
 *   pm2 start deploy/ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup
 *
 * Três processos: o app Next.js (estoque-ia-web), o serviço WhatsApp
 * (estoque-ia-whatsapp, Fase 6) e o serviço de jobs (estoque-ia-jobs, Fase 8)
 * — separados de propósito (seção 33): se qualquer um travar, os outros
 * continuam no ar.
 *
 * Variáveis sensíveis ficam em /etc/estoque-ia/web.env e
 * /etc/estoque-ia/whatsapp.env (chmod 600), carregadas abaixo — nunca
 * neste arquivo. pnpm-workspace.yaml marca `puppeteer: false` por padrão
 * (evita baixar ~300MB de Chromium em qualquer `pnpm install`); rode
 * `pnpm approve-builds` manualmente na VPS antes do primeiro deploy do
 * serviço WhatsApp.
 */
const path = require("node:path");
const fs = require("node:fs");

const ENV_FILE = process.env.ESTOQUE_IA_ENV_FILE || "/etc/estoque-ia/web.env";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

module.exports = {
  apps: [
    {
      name: "estoque-ia-web",
      cwd: path.join(__dirname, "..", "apps", "web"),
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      kill_timeout: 10000,
      time: true,
      env_production: {
        NODE_ENV: "production",
        ...loadEnvFile(ENV_FILE),
      },
    },
    {
      // Fase 6: whatsapp-web.js + Chromium isolados num processo próprio — se o
      // Chromium travar, estoque/CRM/vendas/financeiro continuam no ar (seção 33).
      // Variáveis (MAIN_APP_URL, WHATSAPP_SERVICE_SECRET, SESSIONS_PATH) ficam no
      // mesmo arquivo de env do app (chmod 600), nunca aqui.
      name: "estoque-ia-whatsapp",
      cwd: path.join(__dirname, "..", "services", "whatsapp"),
      script: "src/index.ts",
      node_args: "--import tsx",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      kill_timeout: 10000,
      time: true,
      env_production: {
        NODE_ENV: "production",
        ...loadEnvFile(process.env.ESTOQUE_IA_WHATSAPP_ENV_FILE || "/etc/estoque-ia/whatsapp.env"),
      },
    },
    {
      // Fase 8: varreduras periódicas (hoje só reservas vencidas — ver
      // services/jobs). Só precisa da URL/chave de serviço do Supabase, que
      // já existem no env do app — reusa o mesmo arquivo, sem segredo novo.
      name: "estoque-ia-jobs",
      cwd: path.join(__dirname, "..", "services", "jobs"),
      script: "src/index.ts",
      node_args: "--import tsx",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "256M",
      kill_timeout: 10000,
      time: true,
      env_production: {
        NODE_ENV: "production",
        ...loadEnvFile(ENV_FILE),
      },
    },
  ],
};
