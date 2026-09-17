import { describe, expect, it } from "vitest";
import { completedSteps, ONBOARDING_STEPS } from "./onboarding";

describe("onboarding progress", () => {
  it("is derived only from real data", () => {
    expect([...completedSteps({ hasCompany: false, legalName: null, document: null, phone: null })]).toEqual([
      "account",
    ]);
    expect(
      completedSteps({ hasCompany: true, legalName: null, document: null, phone: null }).has("company_details"),
    ).toBe(false);
    expect(
      completedSteps({
        hasCompany: true,
        legalName: "Gorila LTDA",
        document: "11222333000181",
        phone: "11999990000",
      }).has("company_details"),
    ).toBe(true);
  });

  it("marks catalog and stock steps from real counts", () => {
    const base = { hasCompany: true, legalName: null, document: null, phone: null };
    expect(completedSteps({ ...base, productCount: 0 }).has("products")).toBe(false);
    expect(completedSteps({ ...base, productCount: 3 }).has("products")).toBe(true);
    expect(completedSteps({ ...base, stockedItemCount: 1 }).has("stock")).toBe(true);
  });

  it("does not link steps of modules that are not implemented", () => {
    for (const step of ONBOARDING_STEPS.filter((item) => item.availability === "soon")) {
      expect(step.href).toBeUndefined();
    }
  });
});
