/**
 * SCORING_SPECIFICATION §7 — every row of Examples A, B and C (AC-19, ±0.0001).
 */
import { describe, expect, it } from "vitest";
import {
  Rational,
  e1rm,
  memberSeasonValues,
  rankScores,
  scoreMember,
  testCategoryPoints,
  treadmillPoints,
  consistencyPoints,
  type MemberScore,
  type ParticipantHistory,
  type SeasonWindow,
} from "@/modules/scoring";
import { close4, r, values } from "./helpers";

const season: SeasonWindow = { type: "championship", startsOn: "2026-12-01", endsOn: "2026-12-31" };

describe("Example A — full member", () => {
  // month entries as logged
  const deadliftM = e1rm(95, 5);
  const benchM = e1rm("72.5", 4);
  const squatM = e1rm(85, 3);

  it("e1RM of the month entries (§2)", () => {
    expect(close4(deadliftM, 110.8333)).toBe(true);
    expect(deadliftM.toString()).toBe("665/6"); // exactly 110.8333…
    expect(close4(benchM, 82.1667)).toBe(true);
    expect(close4(squatM, 93.5)).toBe(true);
  });

  const member = scoreMember(values({
    baseline: { deadlift: 100, bench: 70, squat: 90, pullups: 3, pushups: 20 },
    monthBest: { deadlift: deadliftM.toFixed(12), bench: benchM.toFixed(12), squat: squatM.toFixed(12), pullups: 6, pushups: 28 },
    treadmill: [5, 5, 4, 5, 5, 5, 5, 4, 4],
    plannedSessions: 10,
    attendedDays: 9,
  }));

  it.each([
    ["deadlift", 72.2222],
    ["bench", 100],
    ["squat", 25.9259],
    ["pullups", 90],
    ["pushups", 120],
    ["treadmill", 168],
    ["consistency", 150],
  ] as const)("%s = %d", (category, expected) => {
    expect(close4(member.categories[category], expected)).toBe(true);
  });

  it("total 726.15 → shows 726", () => {
    expect(close4(member.total, 726.1481)).toBe(true);
    expect(member.total.roundHalfUp()).toBe(726);
    expect(close4(member.improvementPoints, 408.1481)).toBe(true);
  });

  it("same result with the exact month bests (no decimal rounding at all)", () => {
    const exact = scoreMember({
      ...values({ baseline: { deadlift: 100, bench: 70, squat: 90, pullups: 3, pushups: 20 }, treadmill: [5, 5, 4, 5, 5, 5, 5, 4, 4], plannedSessions: 10, attendedDays: 9 }),
      monthBest: { deadlift: deadliftM, bench: benchM, squat: squatM, pullups: r(6), pushups: r(28) },
    });
    // 72 2/9 + 100 + 25 25/27 + 90 + 120 + 168 + 150 = 726 4/27
    expect(exact.total.toString()).toBe("19606/27");
    expect(exact.total.roundHalfUp()).toBe(726);
  });
});

describe("Example B — edge cases", () => {
  it("lift M below B (B 100, M 95) → 0", () => {
    expect(testCategoryPoints("deadlift", r(100), r(95)).isZero()).toBe(true);
  });
  it("lift exactly +15% (B 100, M 115) → 100", () => {
    expect(testCategoryPoints("squat", r(100), r(115)).eq(r(100))).toBe(true);
  });
  it("pull-ups B 0, M 2 → 60", () => {
    expect(testCategoryPoints("pullups", r(0), r(2)).eq(r(60))).toBe(true);
  });
  it("push-ups +14 reps → 150 (cap)", () => {
    expect(testCategoryPoints("pushups", r(20), r(34)).eq(r(150))).toBe(true);
  });
  it("treadmill one day 8 km → credited 5 → 20 pts", () => {
    expect(treadmillPoints([r(8)]).eq(r(20))).toBe(true);
  });
  it("treadmill 12 days × 5 km → 60 → capped 50 → 200", () => {
    expect(treadmillPoints(Array.from({ length: 12 }, () => r(5))).eq(r(200))).toBe(true);
  });
  it("consistency planned 12, attended 14 → 200 (not 233.3)", () => {
    expect(consistencyPoints(14, 12).eq(r(200))).toBe(true);
  });
  it("consistency planned 6, attended 6 → 1 × 0.5 × 200 = 100", () => {
    expect(consistencyPoints(6, 6).eq(r(100))).toBe(true);
  });
  it("non-rookie, never logged squat before → squat = 0", () => {
    const s = scoreMember(values({ baseline: { deadlift: 100 }, monthBest: { deadlift: 110, squat: 120 } }));
    expect(s.isRookie).toBe(false);
    expect(s.categories.squat.isZero()).toBe(true);
  });
  it("rookie with M values in all test cats → test cats 0, in Rookies list", () => {
    const s = scoreMember(values({
      isRookie: true,
      monthBest: { deadlift: 150, bench: 100, squat: 130, pullups: 10, pushups: 40 },
      treadmill: [3],
      attendedDays: 1,
    }));
    for (const c of ["deadlift", "bench", "squat", "pullups", "pushups"] as const) expect(s.categories[c].isZero()).toBe(true);
    expect(s.improvementPoints.isZero()).toBe(true);
    expect(s.total.eq(r(12).add(consistencyPoints(1, 12)))).toBe(true);
  });
  it("voided entry was the month best → ignored; M = next best", () => {
    const participant: ParticipantHistory = {
      memberId: "v", isActive: true, plannedSessions: 12, attendance: [],
      entries: [
        { category: "pushups", performedOn: "2026-11-20", reps: 20 },
        { category: "pushups", performedOn: "2026-12-03", reps: 30, voided: true },
        { category: "pushups", performedOn: "2026-12-04", reps: 25 },
      ],
    };
    const v = memberSeasonValues(participant, season);
    expect(v.monthBest.pushups?.eq(r(25))).toBe(true);
    expect(scoreMember(v).categories.pushups.eq(r(75))).toBe(true);
  });
  it("maximum possible → 1000", () => {
    const s = scoreMember(values({
      baseline: { deadlift: 100, bench: 100, squat: 100, pullups: 0, pushups: 0 },
      monthBest: { deadlift: 200, bench: 200, squat: 200, pullups: 50, pushups: 100 },
      treadmill: Array.from({ length: 20 }, () => 10),
      plannedSessions: 12,
      attendedDays: 31,
    }));
    expect(s.total.eq(r(1000))).toBe(true);
  });
});

describe("Example C — ranking", () => {
  // Totals/improvement/consistency exactly as the table states them.
  const row = (memberId: string, total: string, improvement: string, consistency: string): MemberScore => ({
    memberId, isActive: true, isRookie: false,
    categories: { deadlift: Rational.ZERO, bench: Rational.ZERO, squat: Rational.ZERO, pullups: Rational.ZERO, pushups: Rational.ZERO, treadmill: Rational.ZERO, consistency: r(consistency) },
    improvementPoints: r(improvement), total: r(total), baseline: {}, monthBest: {},
  });
  const table = [
    row("A", "800.0", "400", "200"),
    row("B", "800.0", "450", "150"),
    row("C", "790.4", "390.4", "200"),
    row("D", "700.0", "300", "200"),
    row("E", "700.0", "300", "200"),
    row("F", "650.0", "250", "200"),
  ];

  it("B 1, A 2, C 3, D 4, E 4, F 6", () => {
    const ranked = rankScores(table);
    expect(ranked.map((x) => [x.memberId, x.rank])).toEqual([["B", 1], ["A", 2], ["C", 3], ["D", 4], ["E", 4], ["F", 6]]);
  });

  it("input order does not change the result", () => {
    const reversed = rankScores([...table].reverse());
    expect(reversed.map((x) => [x.memberId, x.rank])).toEqual([["B", 1], ["A", 2], ["C", 3], ["D", 4], ["E", 4], ["F", 6]]);
  });
});
