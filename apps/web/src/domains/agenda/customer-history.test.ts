import { expect, it } from "vitest";
import { customerHistory } from "./customer-history";

it("splits upcoming from past and counts each outcome, flagging past appointments nobody marked", () => {
  const now = new Date("2026-10-29T15:00:00Z");
  const rows = [
    { id: "a", startsAt: "2026-11-05T14:00:00Z", status: "SCHEDULED" as const },
    { id: "b", startsAt: "2026-10-30T14:00:00Z", status: "CONFIRMED" as const },
    { id: "c", startsAt: "2026-10-20T14:00:00Z", status: "COMPLETED" as const },
    { id: "d", startsAt: "2026-10-22T14:00:00Z", status: "CANCELED" as const },
    { id: "e", startsAt: "2026-10-25T14:00:00Z", status: "NO_SHOW" as const },
    { id: "f", startsAt: "2026-10-27T14:00:00Z", status: "CONFIRMED" as const },
    { id: "g", startsAt: "2026-11-10T14:00:00Z", status: "CANCELED" as const },
  ];
  const history = customerHistory(rows, now);
  expect(history.upcoming.map((row) => row.id)).toEqual(["b", "a"]);
  expect(history.past.map((row) => row.id)).toEqual(["g", "f", "e", "d", "c"]);
  expect(history.counts).toEqual({ total: 7, completed: 1, upcoming: 2, canceled: 2, noShow: 1, unmarked: 1 });
});
