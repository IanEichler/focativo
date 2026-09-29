import { describe, expect, it } from "vitest";
import { maskPhone } from "./masks";
import { customerSchema } from "@/domains/customers/schemas";

describe("phone fields", () => {
  it("preserves every digit when opening and saving Brazilian and international contacts", () => {
    for (const phone of ["5511998887777", "551133334444", "14155552671", "442079460958", "123456789012345"]) {
      const displayed = maskPhone(phone === "14155552671" ? `+${phone}` : phone);
      const parsed = customerSchema.parse({ name: "Cliente", phone: displayed, whatsapp: displayed });
      expect(parsed.phone).toBe(phone);
      expect(parsed.whatsapp).toBe(phone);
      expect(maskPhone(displayed)).toBe(displayed);
    }
  });

  it("retains the existing format for local Brazilian numbers", () => {
    expect(maskPhone("11988887777")).toBe("(11) 98888-7777");
    expect(maskPhone("1133334444")).toBe("(11) 3333-4444");
    expect(maskPhone("5511988887777")).toBe("+55 (11) 98888-7777");
    expect(maskPhone("")).toBe("");
  });
});
