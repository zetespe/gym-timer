import { describe, it, expect } from "vitest";
import { weekKey, dayKey, monthKey, prevMonthKey, duePings, pingUrl } from "./usage";

const D = (y, m, d) => new Date(y, m - 1, d, 12);

describe("period keys", () => {
  it("ISO weeks, including the year boundaries", () => {
    expect(weekKey(D(2026, 9, 24))).toBe("2026-W39");
    expect(weekKey(D(2026, 1, 1))).toBe("2026-W01");  // Thursday
    expect(weekKey(D(2027, 1, 1))).toBe("2026-W53");  // Friday belongs to 2026's last week
    expect(weekKey(D(2024, 12, 30))).toBe("2025-W01"); // Monday belongs to 2025
    expect(weekKey(D(2026, 9, 27))).toBe("2026-W39"); // Sunday closes the week
    expect(weekKey(D(2026, 9, 28))).toBe("2026-W40"); // Monday opens the next
  });
  it("day and month keys, previous month across January", () => {
    expect(dayKey(D(2026, 3, 5))).toBe("2026-03-05");
    expect(monthKey(D(2026, 3, 5))).toBe("2026-03");
    expect(prevMonthKey(D(2026, 1, 15))).toBe("2025-12");
    expect(prevMonthKey(D(2026, 3, 31))).toBe("2026-02");
  });
});

describe("duePings", () => {
  const paths = (sent, now) => duePings(sent, now).map((p) => p.path);
  it("a phone's first open sends install, day, week and a new month", () => {
    expect(paths({}, D(2026, 9, 24))).toEqual(["/app/install", "/app/day", "/app/week", "/app/month/new"]);
    expect(paths(undefined, D(2026, 9, 24))).toHaveLength(4);
  });
  it("a second open the same day sends nothing", () => {
    const sent = { install: true, day: "2026-09-24", week: "2026-W39", month: "2026-09" };
    expect(paths(sent, D(2026, 9, 24))).toEqual([]);
  });
  it("the next day in the same week sends only the day", () => {
    const sent = { install: true, day: "2026-09-24", week: "2026-W39", month: "2026-09" };
    expect(paths(sent, D(2026, 9, 25))).toEqual(["/app/day"]);
  });
  it("a new month right after a used month counts as returning", () => {
    const sent = { install: true, day: "2026-09-30", week: "2026-W40", month: "2026-09" };
    expect(paths(sent, D(2026, 10, 2))).toEqual(["/app/day", "/app/month/returning"]);
  });
  it("a month after a gap counts as new, not returning", () => {
    const sent = { install: true, day: "2026-08-10", week: "2026-W33", month: "2026-08" };
    expect(paths(sent, D(2026, 10, 2))).toEqual(["/app/day", "/app/week", "/app/month/new"]);
  });
});

describe("pingUrl", () => {
  it("sends only the event path and title, as an event, with no identifier", () => {
    const u = new URL(pingUrl({ path: "/app/day", title: "Used today" }));
    expect(u.origin + u.pathname).toBe("https://gymmy.goatcounter.com/count");
    expect(u.searchParams.get("p")).toBe("/app/day");
    expect(u.searchParams.get("e")).toBe("true");
    expect([...u.searchParams.keys()].sort()).toEqual(["e", "p", "rnd", "t"]);
  });
});
