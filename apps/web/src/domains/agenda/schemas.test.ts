import { describe, expect, it } from "vitest";
import { appointmentSchema, serviceSchema } from "./schemas";

describe("serviceSchema", () => {
  it("accepts a minimal valid service", () => {
    const result = serviceSchema.safeParse({ name: "Consulta", durationMinutes: "30", price: "150" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.durationMinutes).toBe(30);
      expect(result.data.price).toBe(150);
    }
  });

  it("rejects a duration outside the allowed range", () => {
    const result = serviceSchema.safeParse({ name: "Consulta", durationMinutes: "1000", price: "150" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = serviceSchema.safeParse({ name: "Consulta", durationMinutes: "30", price: "-10" });
    expect(result.success).toBe(false);
  });

  it("treats an unchecked isActive switch as false (only relevant on edit)", () => {
    const result = serviceSchema.safeParse({ name: "Consulta", durationMinutes: "30", price: "150" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(false);
  });
});

describe("appointmentSchema", () => {
  it("accepts a minimal valid appointment", () => {
    const result = appointmentSchema.safeParse({
      customerId: "123e4567-e89b-12d3-a456-426614174000",
      serviceId: "123e4567-e89b-12d3-a456-426614174001",
      professionalUserId: "123e4567-e89b-12d3-a456-426614174002",
      startsAt: "2026-10-01T14:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed customerId", () => {
    const result = appointmentSchema.safeParse({
      customerId: "not-a-uuid",
      serviceId: "123e4567-e89b-12d3-a456-426614174001",
      professionalUserId: "123e4567-e89b-12d3-a456-426614174002",
      startsAt: "2026-10-01T14:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty startsAt", () => {
    const result = appointmentSchema.safeParse({
      customerId: "123e4567-e89b-12d3-a456-426614174000",
      serviceId: "123e4567-e89b-12d3-a456-426614174001",
      professionalUserId: "123e4567-e89b-12d3-a456-426614174002",
      startsAt: "",
    });
    expect(result.success).toBe(false);
  });
});
