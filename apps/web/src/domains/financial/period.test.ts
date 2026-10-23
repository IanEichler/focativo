import { expect, it } from "vitest";
import { formatDay, monthLabel, monthRange, shiftMonth, validMonth } from "./period";

it("handles month ranges, navigation and labels without timezone drift", () => {
  expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(monthLabel("2026-10")).toBe("Outubro de 2026");
  expect(formatDay("2026-10-01")).toBe("01/10/2026");
  expect(validMonth("2026-13")).toBe(false);
  expect(validMonth("2026-10")).toBe(true);
});
