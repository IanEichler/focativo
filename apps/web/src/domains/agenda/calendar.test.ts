import { describe, expect, it } from "vitest";
import {
  agendaPeriod,
  calendarDate,
  calendarTime,
  clinicDateTime,
  shiftDate,
  validCalendarDate,
  weekStart,
} from "./calendar";

describe("clinic calendar", () => {
  it("converts manual appointment times in the clinic zone, independently of the server zone", () => {
    expect(clinicDateTime("2026-09-30T09:00", "America/Cuiaba").toISOString()).toBe("2026-09-30T13:00:00.000Z");
    expect(clinicDateTime("2026-09-30T09:00", "America/Sao_Paulo").toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });
  it("keeps late appointments on the correct local day and uses an exclusive next midnight", () => {
    expect(calendarDate("2026-10-01T02:30:00Z", "America/Cuiaba")).toBe("2026-09-30");
    expect(calendarTime("2026-10-01T02:30:00Z", "America/Cuiaba")).toBe("22:30");
    expect(agendaPeriod("2026-09-30", "day", "America/Cuiaba")).toEqual({
      days: ["2026-09-30"],
      from: "2026-09-30T04:00:00.000Z",
      to: "2026-10-01T04:00:00.000Z",
    });
  });
  it("handles Monday weeks across month and year boundaries", () => {
    expect(weekStart("2027-01-03")).toBe("2026-12-28");
    const period = agendaPeriod("2027-01-03", "week", "America/Cuiaba");
    expect(period.days).toHaveLength(7);
    expect(period.days[6]).toBe("2027-01-03");
    expect(period.to).toBe("2027-01-04T04:00:00.000Z");
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
  });
  it("rejects impossible dates, malformed times and nonexistent DST times", () => {
    expect(validCalendarDate("2026-02-29")).toBe(false);
    expect(validCalendarDate("2028-02-29")).toBe(true);
    expect(() => clinicDateTime("2026-09-30T24:00", "America/Cuiaba")).toThrow();
    expect(() => clinicDateTime("2026-03-08T02:30", "America/New_York")).toThrow("Esse horário não existe");
  });
});
