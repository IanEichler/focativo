function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export const config = {
  supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseSecretKey: requireEnv("SUPABASE_SECRET_KEY"),
  /** Intervalo entre varreduras, em minutos. */
  intervalMinutes: Number(process.env.JOBS_INTERVAL_MINUTES ?? 5),
};
