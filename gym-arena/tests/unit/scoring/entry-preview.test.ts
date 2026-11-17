/** Entry validation (§2, BR-E4), entry preview and the photo rule (§6, BR-E6, AC-12 … AC-14). */
import { describe, expect, it } from "vitest";
import {
  Rational,
  consistencyPoints,
  entryValue,
  isPhotoRequired,
  isTestCategoryAtCap,
  previewEntry,
  testCategoryPoints,
  validateEntry,
  type EntryPreview,
  type ParticipantHistory,
  type SeasonWindow,
} from "@/modules/scoring";
import { r, values } from "./helpers";

const season: SeasonWindow = { type: "championship", startsOn: "2026-12-01", endsOn: "2026-12-31" };
const today = "2026-12-10";

describe("entry validation (§2, BR-E4)", () => {
  it("accepts valid entries for every category", () => {
    expect(validateEntry({ category: "deadlift", weightKg: "142.5", reps: 5 })).toEqual([]);
    expect(validateEntry({ category: "bench", weightKg: 500, reps: 3 })).toEqual([]);
    expect(validateEntry({ category: "squat", weightKg: "0.5", reps: 4 })).toEqual([]);
    expect(validateEntry({ category: "pullups", reps: 0 })).toEqual([]);
    expect(validateEntry({ category: "pushups", reps: 300 })).toEqual([]);
    expect(validateEntry({ category: "treadmill", km: "0.1" })).toEqual([]);
    expect(validateEntry({ category: "treadmill", km: "42.2" })).toEqual([]);
  });

  it.each([
    [{ category: "deadlift", reps: 5 }, [{ field: "weightKg", code: "REQUIRED" }]],
    [{ category: "deadlift", weightKg: "abc", reps: 5 }, [{ field: "weightKg", code: "INVALID" }]],
    [{ category: "deadlift", weightKg: 0, reps: 5 }, [{ field: "weightKg", code: "OUT_OF_RANGE" }]],
    [{ category: "deadlift", weightKg: "500.5", reps: 5 }, [{ field: "weightKg", code: "OUT_OF_RANGE" }]],
    [{ category: "deadlift", weightKg: "100.25", reps: 5 }, [{ field: "weightKg", code: "STEP" }]],
    [{ category: "bench", weightKg: 100 }, [{ field: "reps", code: "REQUIRED" }]],
    [{ category: "bench", weightKg: 100, reps: 6 }, [{ field: "reps", code: "OUT_OF_RANGE" }]], // AC-9
    [{ category: "squat", weightKg: 100, reps: 2, km: 1 }, [{ field: "reps", code: "OUT_OF_RANGE" }, { field: "km", code: "NOT_ALLOWED" }]],
    [{ category: "pullups" }, [{ field: "reps", code: "REQUIRED" }]],
    [{ category: "pullups", reps: 2.5 }, [{ field: "reps", code: "INVALID" }]],
    [{ category: "pullups", reps: 101 }, [{ field: "reps", code: "OUT_OF_RANGE" }]],
    [{ category: "pushups", reps: -1 }, [{ field: "reps", code: "OUT_OF_RANGE" }]],
    [{ category: "pushups", reps: 301, weightKg: 10, km: 1 }, [{ field: "reps", code: "OUT_OF_RANGE" }, { field: "weightKg", code: "NOT_ALLOWED" }, { field: "km", code: "NOT_ALLOWED" }]],
    [{ category: "treadmill" }, [{ field: "km", code: "REQUIRED" }]],
    [{ category: "treadmill", km: "x" }, [{ field: "km", code: "INVALID" }]],
    [{ category: "treadmill", km: "0.05" }, [{ field: "km", code: "OUT_OF_RANGE" }]],
    [{ category: "treadmill", km: "42.3" }, [{ field: "km", code: "OUT_OF_RANGE" }]],
    [{ category: "treadmill", km: "3.25" }, [{ field: "km", code: "STEP" }]],
    [{ category: "treadmill", km: 3, weightKg: 1, reps: 1 }, [{ field: "weightKg", code: "NOT_ALLOWED" }, { field: "reps", code: "NOT_ALLOWED" }]],
  ] as const)("%j → %j", (input, expected) => {
    expect(validateEntry(input)).toEqual(expected);
  });

  it("entryValue gives the comparable value and refuses invalid entries", () => {
    expect(entryValue({ category: "deadlift", weightKg: 95, reps: 5 }).toFixed(4)).toBe("110.8333"); // AC-8
    expect(entryValue({ category: "pushups", reps: 28 }).eq(r(28))).toBe(true);
    expect(entryValue({ category: "treadmill", km: "4.2" }).eq(r("4.2"))).toBe(true);
    expect(() => entryValue({ category: "bench", weightKg: 100, reps: 6 })).toThrow(/reps OUT_OF_RANGE/);
  });
});

describe("category edge cases", () => {
  it("lift with a zero baseline cannot divide by zero", () => {
    expect(testCategoryPoints("bench", Rational.ZERO, r(50)).isZero()).toBe(true);
  });
  it("at-cap detection for every test category", () => {
    expect(isTestCategoryAtCap("deadlift", r(100), r(115))).toBe(true);
    expect(isTestCategoryAtCap("deadlift", r(100), r(114))).toBe(false);
    expect(isTestCategoryAtCap("pullups", r(3), r(8))).toBe(true);
    expect(isTestCategoryAtCap("pushups", r(3), r(12))).toBe(false);
    expect(isTestCategoryAtCap("pushups", r(3), null)).toBe(false);
  });
  it("consistency rejects impossible plans and attendance counts", () => {
    expect(() => consistencyPoints(1, 0)).toThrow(RangeError);
    expect(() => consistencyPoints(1, 32)).toThrow(RangeError);
    expect(() => consistencyPoints(1, 2.5)).toThrow(RangeError);
    expect(() => consistencyPoints(-1, 12)).toThrow(RangeError);
    expect(consistencyPoints(0, 12).isZero()).toBe(true);
    expect(consistencyPoints(31, 31).eq(r(200))).toBe(true);
  });
});

const member = (extra: Partial<ParticipantHistory> = {}): ParticipantHistory => ({
  memberId: "m", isActive: true, plannedSessions: 12, attendance: [],
  entries: [
    { category: "deadlift", performedOn: "2026-11-15", weightKg: 90, reps: 5 },   // B = 105
    { category: "deadlift", performedOn: "2026-12-02", weightKg: 90, reps: 5 },   // M = 105 (no gain yet)
    { category: "treadmill", performedOn: "2026-12-02", km: 5 },
  ],
  ...extra,
});
const ok = (result: ReturnType<typeof previewEntry>): EntryPreview => {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.preview;
};

describe("preview (UX C4) and photo rule (§6)", () => {
  it("new best → photo required, points and total delta (incl. today's attendance)", () => {
    const pv = ok(previewEntry({ season, participant: member({ attendance: [{ attendedOn: "2026-12-02" }] }), today,
      entry: { category: "deadlift", weightKg: 95, reps: 5 } }));
    expect(pv.value.toFixed(4)).toBe("110.8333");
    expect(pv.isNewBest).toBe(true);
    expect(pv.photoRequired).toBe(true);
    expect(pv.categoryPointsBefore.isZero()).toBe(true);
    // (665/6 − 105) / 105 = 1/18 → 5.5556 % → 5.5556 / 15 × 100 = 1000/27
    expect(pv.categoryPointsAfter.toString()).toBe("1000/27");
    expect(pv.categoryPointsAfter.toFixed(4)).toBe("37.0370");
    // total delta = deadlift gain + one extra attendance day (1/12 × 200)
    expect(pv.pointsDelta.eq(pv.categoryPointsAfter.add(r(200).div(r(12))))).toBe(true);
  });

  it("AC-12: B = 100, M = 105, logging e1RM 108 needs a photo; AC-13: e1RM 98 does not", () => {
    const v = values({ baseline: { deadlift: 100 }, monthBest: { deadlift: 105 } });
    expect(isPhotoRequired(season, v, "deadlift", r(108))).toBe(true);
    expect(isPhotoRequired(season, v, "deadlift", r(98))).toBe(false);
    expect(isPhotoRequired(season, v, "deadlift", r(105))).toBe(false); // equal is not higher
  });

  it("no photo when the category is already at its cap, when there is no baseline, or for a rookie", () => {
    expect(isPhotoRequired(season, values({ baseline: { pushups: 10 }, monthBest: { pushups: 20 } }), "pushups", r(25))).toBe(false);
    expect(isPhotoRequired(season, values({ monthBest: { pushups: 20 } }), "pushups", r(25))).toBe(false);
    expect(isPhotoRequired(season, values({ isRookie: true, baseline: { pushups: 10 } }), "pushups", r(25))).toBe(false);
    expect(isPhotoRequired(season, values({ baseline: { pushups: 10 } }), "pushups", r(11))).toBe(true); // M null → compare with B
  });

  it("treadmill: photo while credited km < 50 (also for rookies); AC-14: none at 50", () => {
    expect(isPhotoRequired(season, values({ treadmill: [5, 5, 5] }), "treadmill", r(3))).toBe(true);
    expect(isPhotoRequired(season, values({ isRookie: true }), "treadmill", r(3))).toBe(true);
    expect(isPhotoRequired(season, values({ treadmill: Array.from({ length: 10 }, () => 5) }), "treadmill", r(5))).toBe(false);
  });

  it("preseason: photo never required, all points 0", () => {
    const pre: SeasonWindow = { type: "preseason", startsOn: "2026-12-01", endsOn: "2026-12-14" };
    const pv = ok(previewEntry({ season: pre, participant: member(), today, entry: { category: "deadlift", weightKg: 200, reps: 5 } }));
    expect(pv.photoRequired).toBe(false);
    expect(pv.totalBefore.isZero() && pv.totalAfter.isZero() && pv.pointsDelta.isZero()).toBe(true);
    expect(pv.categoryPointsAfter.isZero()).toBe(true);
    expect(pv.isNewBest).toBe(true);
  });

  it("not a new best → recorded, no category change; first-ever value is not a 'new best'", () => {
    const pv = ok(previewEntry({ season, participant: member(), today, entry: { category: "deadlift", weightKg: 80, reps: 5 } }));
    expect(pv.isNewBest).toBe(false);
    expect(pv.photoRequired).toBe(false);
    expect(pv.categoryPointsAfter.eq(pv.categoryPointsBefore)).toBe(true);
    const first = ok(previewEntry({ season, participant: member(), today, entry: { category: "pullups", reps: 8 } }));
    expect(first.isNewBest).toBe(false);
    const tm = ok(previewEntry({ season, participant: member(), today, entry: { category: "treadmill", km: 4 } }));
    expect(tm.isNewBest).toBe(false);
    expect(tm.categoryPointsAfter.sub(tm.categoryPointsBefore).eq(r(16))).toBe(true);
    expect(tm.photoRequired).toBe(true);
  });

  it("attendance already recorded today is not counted twice", () => {
    const pv = ok(previewEntry({ season, participant: member({ attendance: [{ attendedOn: today }] }), today,
      entry: { category: "pushups", reps: 5 } }));
    expect(pv.pointsDelta.isZero()).toBe(true);
  });

  it("decision 1: automatic attendance never requires a photo, even when it raises the total", () => {
    // not a best (80 kg × 5 < B 105) on a new attendance day: Consistency rises, total rises, no photo
    const pv = ok(previewEntry({ season, participant: member(), today, entry: { category: "deadlift", weightKg: 80, reps: 5 } }));
    expect(pv.categoryPointsAfter.eq(pv.categoryPointsBefore)).toBe(true);
    expect(pv.pointsDelta.eq(r(200).div(r(12)))).toBe(true); // +1 attendance day of 12
    expect(pv.pointsDelta.gt(Rational.ZERO)).toBe(true);
    expect(pv.photoRequired).toBe(false);
    // same for a rookie and for a category with no baseline
    const rookie = ok(previewEntry({ season, participant: { ...member(), entries: [] }, today, entry: { category: "pushups", reps: 50 } }));
    expect(rookie.pointsDelta.gt(Rational.ZERO)).toBe(true);
    expect(rookie.photoRequired).toBe(false);
  });

  it("decision 2: a PR beats the previous highest recorded value, including the baseline", () => {
    const history = (entries: ParticipantHistory["entries"]): ParticipantHistory => ({ ...member(), entries });
    const pr = (participant: ParticipantHistory, reps: number) =>
      ok(previewEntry({ season, participant, today, entry: { category: "pullups", reps } })).isNewBest;
    // first value this season, above the baseline → PR
    expect(pr(history([{ category: "pullups", performedOn: "2026-11-01", reps: 8 }]), 9)).toBe(true);
    // equal to the previous highest → not a PR
    expect(pr(history([{ category: "pullups", performedOn: "2026-11-01", reps: 8 }]), 8)).toBe(false);
    // above this season's earlier value but not above the baseline → not a PR
    expect(pr(history([
      { category: "pullups", performedOn: "2026-11-01", reps: 12 },
      { category: "pullups", performedOn: "2026-12-02", reps: 9 },
    ]), 10)).toBe(false);
    // above both baseline and this season's best → PR
    expect(pr(history([
      { category: "pullups", performedOn: "2026-11-01", reps: 12 },
      { category: "pullups", performedOn: "2026-12-02", reps: 13 },
    ]), 14)).toBe(true);
    // voided values are not "recorded": a voided 20 does not block a PR of 13
    expect(pr(history([
      { category: "pullups", performedOn: "2026-11-01", reps: 12 },
      { category: "pullups", performedOn: "2026-12-02", reps: 20, voided: true },
    ]), 13)).toBe(true);
    // first-ever value in the category → not a PR
    expect(pr(history([]), 30)).toBe(false);
    // a rookie beating their own earlier value this season → PR (no points, by §4)
    const rookie = ok(previewEntry({ season, participant: history([{ category: "pullups", performedOn: "2026-12-02", reps: 5 }]), today,
      entry: { category: "pullups", reps: 6 } }));
    expect(rookie.isNewBest).toBe(true);
    expect(rookie.categoryPointsAfter.isZero()).toBe(true);
    expect(rookie.photoRequired).toBe(false);
    // treadmill is never a PR, however far
    const tm = (km: string) => ok(previewEntry({ season, participant: member(), today, entry: { category: "treadmill", km } })).isNewBest;
    expect(tm("42.2")).toBe(false);
  });

  it("invalid input returns field errors instead of a preview", () => {
    expect(previewEntry({ season, participant: member(), today, entry: { category: "bench", weightKg: 100, reps: 6 } }))
      .toEqual({ ok: false, errors: [{ field: "reps", code: "OUT_OF_RANGE" }] });
  });
});
