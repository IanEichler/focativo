/**
 * PM2 — produção em VPS Linux (sem Docker).
 *
 *   pnpm install --frozen-lockfile && pnpm build
 *   pm2 start deploy/ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup
 *
 * Variáveis sensíveis ficam em /etc/estoque-ia/web.env (chmod 600), carregado
 * abaixo — nunca neste arquivo.
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
    // Fase 6: serviço WhatsApp (whatsapp-web.js + Chromium) como processo separado.
  ],
};
