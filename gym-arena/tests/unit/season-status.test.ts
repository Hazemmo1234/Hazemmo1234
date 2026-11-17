import { describe, expect, it } from "vitest";
import {
  activeSeason, isNextMonthCovered, nextScheduledSeason, seasonDaysLeft, seasonStatus, suggestNextMonth, type SeasonDates,
} from "@/modules/seasons/status";

const s = (starts_on: string, ends_on: string, closed_at: string | null = null, type: SeasonDates["type"] = "championship"): SeasonDates =>
  ({ type, starts_on, ends_on, closed_at });

describe("season status (BR-S3)", () => {
  const dec = s("2026-12-01", "2026-12-31");
  it("derives scheduled → active → ended → closed from dates", () => {
    expect(seasonStatus(dec, "2026-11-30")).toBe("scheduled");
    expect(seasonStatus(dec, "2026-12-01")).toBe("active");
    expect(seasonStatus(dec, "2026-12-31")).toBe("active");
    expect(seasonStatus(dec, "2027-01-01")).toBe("ended");
    expect(seasonStatus(s("2026-12-01", "2026-12-31", "2027-01-02T10:00:00Z"), "2026-12-15")).toBe("closed");
  });

  it("days left counts today while active, days to start while scheduled", () => {
    expect(seasonDaysLeft(dec, "2026-12-20")).toBe(12);
    expect(seasonDaysLeft(dec, "2026-12-31")).toBe(1);
    expect(seasonDaysLeft(dec, "2026-11-25")).toBe(6);
    expect(seasonDaysLeft(dec, "2027-01-03")).toBe(0);
  });

  it("finds the active and the next scheduled season", () => {
    const list = [s("2027-02-01", "2027-02-28"), dec, s("2027-01-01", "2027-01-31")];
    expect(activeSeason(list, "2026-12-10")).toBe(dec);
    expect(activeSeason(list, "2026-11-10")).toBeNull();
    expect(nextScheduledSeason(list, "2026-12-10")?.starts_on).toBe("2027-01-01");
    expect(nextScheduledSeason([dec], "2027-03-01")).toBeNull();
  });

  it("checks whether next month is covered (UX A1 alert) and suggests it (BR-S1)", () => {
    expect(isNextMonthCovered([dec], "2026-11-14")).toBe(true);
    expect(isNextMonthCovered([dec], "2026-12-14")).toBe(false);
    expect(suggestNextMonth("2026-11-14")).toEqual({ startsOn: "2026-12-01", endsOn: "2026-12-31" });
    expect(suggestNextMonth("2026-12-31")).toEqual({ startsOn: "2027-01-01", endsOn: "2027-01-31" });
    expect(suggestNextMonth("2027-01-15")).toEqual({ startsOn: "2027-02-01", endsOn: "2027-02-28" });
  });
});
