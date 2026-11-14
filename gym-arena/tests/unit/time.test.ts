import { describe, expect, it } from "vitest";
import { addDays, cairoDate, daysBetween, daysLeft, isIsoDate, isWithin, monthBounds, today } from "@/lib/time";

describe("lib/time — Cairo day boundaries (TEST_PLAN, AC-11)", () => {
  it("winter (UTC+2): 21:59 UTC is still the same Cairo day, 22:00 UTC is the next", () => {
    expect(cairoDate(new Date("2026-01-15T21:59:59Z"))).toBe("2026-01-15");
    expect(cairoDate(new Date("2026-01-15T22:00:00Z"))).toBe("2026-01-16");
  });

  it("summer DST (UTC+3): 20:59 UTC is the same day, 21:00 UTC is the next", () => {
    expect(cairoDate(new Date("2026-07-15T20:59:59Z"))).toBe("2026-07-15");
    expect(cairoDate(new Date("2026-07-15T21:00:00Z"))).toBe("2026-07-16");
  });

  it("in summer, 22:00 UTC vs 21:59 UTC are both already the next Cairo day", () => {
    expect(cairoDate(new Date("2026-07-15T21:59:00Z"))).toBe("2026-07-16");
    expect(cairoDate(new Date("2026-07-15T22:00:00Z"))).toBe("2026-07-16");
  });

  it("23:59 vs 00:01 Cairo land on different days (AC-11)", () => {
    // winter: 23:59 Cairo = 21:59 UTC; 00:01 Cairo = 22:01 UTC
    expect(today(new Date("2026-12-01T21:59:00Z"))).toBe("2026-12-01");
    expect(today(new Date("2026-12-01T22:01:00Z"))).toBe("2026-12-02");
  });

  it("today() defaults to the current instant", () => {
    expect(isIsoDate(today())).toBe(true);
  });
});

describe("lib/time — date arithmetic", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("daysBetween / isWithin / daysLeft", () => {
    expect(daysBetween("2026-12-01", "2026-12-31")).toBe(30);
    expect(isWithin("2026-12-31", "2026-12-01", "2026-12-31")).toBe(true);
    expect(isWithin("2027-01-01", "2026-12-01", "2026-12-31")).toBe(false);
    expect(daysLeft("2026-12-31", new Date("2026-12-20T10:00:00Z"))).toBe(12);
    expect(daysLeft("2026-12-31", new Date("2027-01-05T10:00:00Z"))).toBe(0);
  });

  it("monthBounds gives the calendar month (BR-S1)", () => {
    expect(monthBounds("2026-02-14")).toEqual({ startsOn: "2026-02-01", endsOn: "2026-02-28" });
    expect(monthBounds("2026-12-05")).toEqual({ startsOn: "2026-12-01", endsOn: "2026-12-31" });
  });

  it("rejects invalid dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-1-1")).toBe(false);
    expect(() => addDays("bad", 1)).toThrow();
  });
});
