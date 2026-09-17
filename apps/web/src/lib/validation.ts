import type { z } from "zod";
import type { ActionState } from "./errors";

/** Converte FormData em objeto simples (último valor vence; campos vazios viram undefined). */
export function formDataToObject(formData: FormData): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value === "string") result[key] = value === "" ? undefined : value;
  }
  return result;
}

const SECRET_FIELD = /pass(word)?|senha|secret|token/i;

/** Mantém apenas valores seguros para devolver ao formulário. */
export function safeFormValues<Field extends string>(
  input: Record<string, string | undefined>,
): Partial<Record<Field, string>> {
  const values: Partial<Record<Field, string>> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && !SECRET_FIELD.test(key)) values[key as Field] = value;
  }
  return values;
}

export function validationError<Field extends string>(
  error: z.ZodError,
  input?: Record<string, string | undefined>,
  message = "Revise os campos destacados.",
): ActionState<Field> {
  const fieldErrors: Partial<Record<Field, string[]>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    const key = field as Field;
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { status: "error", message, fieldErrors, values: input ? safeFormValues<Field>(input) : undefined };
}
