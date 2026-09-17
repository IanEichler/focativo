import "server-only";
import { getLogLevel } from "./env.server";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|service[-_]?role|credential|cpf|document/i;

export interface LogFields {
  event: string;
  tenant_id?: string | null;
  user_id?: string | null;
  request_id?: string | null;
  status?: "ok" | "error" | "denied" | "skipped" | string;
  [key: string]: unknown;
}

/** Remove recursivamente valores de chaves sensíveis antes de logar. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[redacted]" : redact(inner, depth + 1),
      ]),
    );
  }
  return value;
}

function write(level: Level, fields: LogFields) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[getLogLevel()]) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    ...(redact(fields) as LogFields),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Logger estruturado (JSON por linha), pronto para PM2/journald. */
export const logger = {
  debug: (fields: LogFields) => write("debug", fields),
  info: (fields: LogFields) => write("info", fields),
  warn: (fields: LogFields) => write("warn", fields),
  error: (fields: LogFields) => write("error", fields),
};
