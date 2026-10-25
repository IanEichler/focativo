import { expect, it } from "vitest";
import { sessionDates } from "./session-dates";

it("spaces sessions by days or by calendar month", () => {
  expect(sessionDates("2026-12-24", "7", 3)).toEqual(["2026-12-24", "2026-12-31", "2027-01-07"]);
  expect(sessionDates("2026-10-30", "14", 2)).toEqual(["2026-10-30", "2026-11-13"]);
  expect(sessionDates("2027-01-31", "month", 3)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  expect(sessionDates("2026-10-30", "7", 0)).toEqual([]);
});
