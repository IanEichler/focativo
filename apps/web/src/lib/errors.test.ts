import { describe, expect, it } from "vitest";
import { DB_ERROR_MESSAGES, GENERIC_ERROR_MESSAGE, toUserMessage } from "./errors";

describe("toUserMessage", () => {
  it("maps stable database codes to friendly messages", () => {
    expect(toUserMessage({ message: "last_owner" })).toBe(DB_ERROR_MESSAGES.last_owner);
    expect(toUserMessage({ message: "role_hierarchy", code: "42501" })).toBe(DB_ERROR_MESSAGES.role_hierarchy);
  });

  it("never leaks raw Postgres errors", () => {
    const unique = { message: 'duplicate key value violates unique constraint "tenants_slug_key"', code: "23505" };
    expect(toUserMessage(unique)).toBe(DB_ERROR_MESSAGES.name_taken);
    expect(toUserMessage(unique)).not.toContain("constraint");

    const fk = { message: 'insert or update on table "products" violates foreign key constraint', code: "23503" };
    expect(toUserMessage(fk)).toBe(DB_ERROR_MESSAGES.in_use);
    expect(toUserMessage(fk)).not.toContain("constraint");

    const unknown = { message: "syntax error at or near SELECT", code: "42601" };
    expect(toUserMessage(unknown)).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage(unknown)).not.toContain("syntax error");
  });

  it("treats insufficient privilege as forbidden", () => {
    expect(toUserMessage({ message: "permission denied for table tenants", code: "42501" })).toBe(
      DB_ERROR_MESSAGES.forbidden,
    );
  });

  it("handles missing errors", () => {
    expect(toUserMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
