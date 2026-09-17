import { describe, expect, it } from "vitest";
import { signUpSchema } from "@/domains/auth/schemas";
import { updateTenantSchema } from "@/domains/tenants/schemas";
import { formDataToObject, safeFormValues, validationError } from "./validation";

describe("form helpers", () => {
  it("converts FormData ignoring Next internal fields and empty strings", () => {
    const formData = new FormData();
    formData.set("name", "Loja");
    formData.set("legalName", "");
    formData.set("$ACTION_ID_abc", "x");
    expect(formDataToObject(formData)).toEqual({ name: "Loja", legalName: undefined });
  });

  it("never echoes secrets back to the form", () => {
    expect(safeFormValues({ email: "a@b.com", password: "segredo123", confirmPassword: "x", token: "t" })).toEqual({
      email: "a@b.com",
    });
  });

  it("groups field errors and keeps safe values", () => {
    const input = { fullName: "A", email: "invalido", password: "curta" };
    const parsed = signUpSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const state = validationError(parsed.error, input);
    expect(state.status).toBe("error");
    if (state.status !== "error") return;
    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(["email", "fullName", "password"]);
    expect(state.values).toEqual({ fullName: "A", email: "invalido" });
  });
});

describe("tenant schemas", () => {
  const base = { name: "Gorila Suplementos", segment: "supplements", timezone: "America/Sao_Paulo" };

  it("normalizes optional fields to null and digits", () => {
    const parsed = updateTenantSchema.parse({ ...base, document: "11.222.333/0001-81", phone: "(11) 99999-0000" });
    expect(parsed).toMatchObject({ document: "11222333000181", phone: "11999990000", legalName: null, email: null });
  });

  it("rejects invalid document, e-mail, timezone and segment", () => {
    const result = updateTenantSchema.safeParse({
      ...base,
      document: "11.222.333/0001-80",
      email: "nao-e-email",
      timezone: "Europe/Lisbon",
      segment: "hacker",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fields = result.error.issues.map((issue) => issue.path[0]).sort();
    expect(fields).toEqual(["document", "email", "segment", "timezone"]);
  });
});
