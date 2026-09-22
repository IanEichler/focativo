import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4001),
  mainAppUrl: requireEnv("MAIN_APP_URL").replace(/\/$/, ""),
  serviceSecret: requireEnv("WHATSAPP_SERVICE_SECRET"),
  sessionsPath: path.resolve(process.env.SESSIONS_PATH ?? "./.wwebjs_auth"),
};
