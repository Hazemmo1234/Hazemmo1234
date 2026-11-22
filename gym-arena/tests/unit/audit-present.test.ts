import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, auditChanges, auditMemberId, isAuditAction } from "@/modules/audit/present";
import { cairoMidnight } from "@/lib/time";

// UX A6: the audit screen shows an allow-list of fields per entity; internal values never.
describe("auditChanges", () => {
  const names = (id: string) => ({ c1: "Coach One", c2: "Coach Two" })[id] ?? null;

  it("entry edit: only the changed, meaningful fields — never paths or ids", () => {
    const before = { member_id: "m", weight_kg: 100, reps: 5, value: 116.6667, photo_path: "entries/a/b/c.webp", performed_on: "2026-03-05" };
    const after = { ...before, weight_kg: 102.5, value: 119.5833 };
    expect(auditChanges("entry", before, after, names)).toEqual([
      { field: "weight_kg", before: "100", after: "102.5" },
      { field: "value", before: "116.6667", after: "119.5833" },
    ]);
  });
  it("reassignment shows coach names, not ids", () => {
    expect(auditChanges("member", { coach_id: "c1" }, { coach_id: "c2" }, names)).toEqual([{ field: "coach_id", before: "Coach One", after: "Coach Two" }]);
  });
  it("season close: the frozen-results count; settings: old → new", () => {
    expect(auditChanges("season", null, { closed_at: "x", results: 42, type: "championship" }, names)).toEqual([
      { field: "type", before: null, after: "championship" },
      { field: "results", before: null, after: "42" },
    ]);
    expect(auditChanges("app_settings", { tv_locale: "ar" }, { tv_locale: "en" }, names)).toEqual([{ field: "tv_locale", before: "ar", after: "en" }]);
    expect(auditChanges("app_settings", null, null, names)).toEqual([]); // tv_key.regenerate: nothing about the key
    expect(auditChanges("unknown", { a: 1 }, { a: 2 }, names)).toEqual([]);
  });
  it("target member of entry and member rows; known actions", () => {
    expect(auditMemberId("entry", "e", { member_id: "m1" }, null)).toBe("m1");
    expect(auditMemberId("member", "m2", null, null)).toBe("m2");
    expect(auditMemberId("season", "s", null, null)).toBeNull();
    expect(isAuditAction("entry.void")).toBe(true);
    expect(isAuditAction("drop table")).toBe(false);
    expect(AUDIT_ACTIONS).toContain("tv_key.regenerate");
  });
});

describe("cairoMidnight (DST-aware Cairo day start)", () => {
  it("winter (UTC+2) and summer (UTC+3)", () => {
    expect(cairoMidnight("2026-01-15").toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(cairoMidnight("2026-07-15").toISOString()).toBe("2026-07-14T21:00:00.000Z");
  });
});
