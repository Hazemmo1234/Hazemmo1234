import { describe, expect, it } from "vitest";
import { createSeasonSchema, updateSeasonSchema } from "@/lib/validation/seasons";
import { checkSeasonUpdate } from "@/modules/seasons/rules";
import type { SeasonDates } from "@/modules/seasons/status";

const season = (starts_on: string, ends_on: string, closed_at: string | null = null): SeasonDates =>
  ({ type: "championship", starts_on, ends_on, closed_at });
const today = "2026-11-14";

describe("season edit rules (BR-S6, BR-S7, API PATCH /api/seasons/:id)", () => {
  const scheduled = season("2026-12-01", "2026-12-31");
  const active = season("2026-11-01", "2026-11-30");
  const ended = season("2026-10-01", "2026-10-31");
  const closed = season("2026-09-01", "2026-09-30", "2026-10-02T10:00:00Z");

  it("closed seasons cannot change at all", () => {
    expect(checkSeasonUpdate(closed, { name: "x" }, today)).toEqual({ code: "SEASON_CLOSED", reason: "closed" });
  });

  it("scheduled: any valid dates; end may not precede start", () => {
    expect(checkSeasonUpdate(scheduled, { starts_on: "2026-12-05", ends_on: "2026-12-20" }, today)).toBeNull();
    expect(checkSeasonUpdate(scheduled, { ends_on: "2026-11-30" }, today)).toEqual({ code: "VALIDATION", reason: "end_before_start" });
    expect(checkSeasonUpdate(scheduled, { starts_on: "2027-01-05" }, today)).toEqual({ code: "VALIDATION", reason: "end_before_start" });
  });

  it("started (active or ended): start date is locked, end date can only be extended", () => {
    for (const s of [active, ended]) {
      expect(checkSeasonUpdate(s, { starts_on: "2026-10-15" }, today)).toEqual({ code: "FORBIDDEN", reason: "started" });
      expect(checkSeasonUpdate(s, { starts_on: s.starts_on, name: "same start is fine" }, today)).toBeNull();
      expect(checkSeasonUpdate(s, { ends_on: "2026-12-05" }, today)).toBeNull();
    }
    expect(checkSeasonUpdate(active, { ends_on: "2026-11-20" }, today)).toEqual({ code: "VALIDATION", reason: "extend_only" });
    expect(checkSeasonUpdate(ended, { ends_on: "2026-10-30" }, today)).toEqual({ code: "VALIDATION", reason: "extend_only" });
    expect(checkSeasonUpdate(active, { name: "Renamed" }, today)).toBeNull();
  });
});

describe("season validation schemas (shared by form and API)", () => {
  it("create: requires name, type, valid ISO dates, end ≥ start; rejects unknown fields", () => {
    const ok = { name: " Arena — December 2026 ", type: "championship", starts_on: "2026-12-01", ends_on: "2026-12-31" };
    const parsed = createSeasonSchema.safeParse(ok);
    expect(parsed.success && parsed.data.name).toBe("Arena — December 2026");
    const issue = (v: unknown) => { const r = createSeasonSchema.safeParse(v); return r.success ? null : r.error.issues[0].message; };
    expect(issue({ ...ok, name: "  " })).toBe("name_required");
    expect(issue({ ...ok, name: "x".repeat(81) })).toBe("name_too_long");
    expect(issue({ ...ok, starts_on: "2026-02-30" })).toBe("invalid_date");
    expect(issue({ ...ok, ends_on: "2026-11-30" })).toBe("end_before_start");
    expect(createSeasonSchema.safeParse({ ...ok, type: "league" }).success).toBe(false);
    expect(createSeasonSchema.safeParse({ ...ok, closed_at: "2026-01-01" }).success).toBe(false); // cannot create closed (BR-S7)
  });

  it("update: only name, starts_on, ends_on; something must change", () => {
    expect(updateSeasonSchema.safeParse({ name: "New" }).success).toBe(true);
    expect(updateSeasonSchema.safeParse({}).success).toBe(false);
    expect(updateSeasonSchema.safeParse({ type: "preseason" }).success).toBe(false);
    expect(updateSeasonSchema.safeParse({ closed_at: "2026-01-01" }).success).toBe(false);
  });
});
