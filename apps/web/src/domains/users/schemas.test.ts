import { describe, expect, it } from "vitest";
import { createUserSchema, setMemberPermissionsSchema } from "./schemas";

describe("createUserSchema", () => {
  const base = { fullName: "Maria Silva", email: "maria@loja.test", password: "senha1234", roleCode: "VENDEDOR" };

  it("accepts a valid payload", () => {
    expect(createUserSchema.safeParse(base).success).toBe(true);
  });

  it("accepts ADMIN as a role too", () => {
    expect(createUserSchema.safeParse({ ...base, roleCode: "ADMIN" }).success).toBe(true);
  });

  it("rejects roles outside the simplified admin/employee choice", () => {
    expect(createUserSchema.safeParse({ ...base, roleCode: "OWNER" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, roleCode: "GERENTE" }).success).toBe(false);
  });

  it("rejects a weak password", () => {
    expect(createUserSchema.safeParse({ ...base, password: "abc" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: "onlyletters" }).success).toBe(false);
  });

  it("rejects a missing full name", () => {
    expect(createUserSchema.safeParse({ ...base, fullName: "A" }).success).toBe(false);
  });
});

describe("setMemberPermissionsSchema", () => {
  it("accepts a valid membershipId with an overrides list", () => {
    const result = setMemberPermissionsSchema.safeParse({
      membershipId: "123e4567-e89b-12d3-a456-426614174000",
      overrides: [
        { code: "sales.discount", granted: true },
        { code: "financial.read", granted: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty overrides list", () => {
    const result = setMemberPermissionsSchema.safeParse({
      membershipId: "123e4567-e89b-12d3-a456-426614174000",
      overrides: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown permission code", () => {
    const result = setMemberPermissionsSchema.safeParse({
      membershipId: "123e4567-e89b-12d3-a456-426614174000",
      overrides: [{ code: "not.a.permission", granted: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed membershipId", () => {
    const result = setMemberPermissionsSchema.safeParse({ membershipId: "nope", overrides: [] });
    expect(result.success).toBe(false);
  });
});
