/** Baseline / month-best windows, rookies, D29 inactive participants, preseason, ties (§1, §4, §5). */
import { describe, expect, it } from "vitest";
import {
  Rational,
  compareScores,
  memberSeasonValues,
  rankSeason,
  scoreMember,
  scoreSeason,
  winners,
  type ParticipantHistory,
  type ScoringEntry,
  type SeasonWindow,
} from "@/modules/scoring";
import { r, values } from "./helpers";

const season: SeasonWindow = { type: "championship", startsOn: "2026-12-01", endsOn: "2026-12-31" };
const p = (memberId: string, entries: ScoringEntry[], extra: Partial<ParticipantHistory> = {}): ParticipantHistory => ({
  memberId, isActive: true, plannedSessions: 12, entries, attendance: [], ...extra,
});

describe("baseline and month best (§1)", () => {
  it("B uses every entry before starts_on (not only last season); M uses the season; later entries are ignored", () => {
    const v = memberSeasonValues(p("m", [
      { category: "deadlift", performedOn: "2025-03-10", weightKg: 120, reps: 5 }, // e1RM 140, a year earlier
      { category: "deadlift", performedOn: "2026-11-30", weightKg: 100, reps: 3 }, // 110, day before season
      { category: "deadlift", performedOn: "2026-12-01", weightKg: 110, reps: 3 }, // 121, first day
      { category: "deadlift", performedOn: "2026-12-31", weightKg: 115, reps: 3 }, // 126.5, last day
      { category: "deadlift", performedOn: "2027-01-01", weightKg: 200, reps: 5 }, // after season
    ]), season);
    expect(v.baseline.deadlift?.eq(r(140))).toBe(true);
    expect(v.monthBest.deadlift?.eq(r("126.5"))).toBe(true);
    expect(scoreMember(v).categories.deadlift.isZero()).toBe(true); // below the all-time baseline → 0, never negative
  });

  it("a result below baseline gives 0 and does not change B (§3)", () => {
    const v = memberSeasonValues(p("m", [
      { category: "pullups", performedOn: "2026-11-01", reps: 10 },
      { category: "pullups", performedOn: "2026-12-05", reps: 7 },
    ]), season);
    expect(v.baseline.pullups?.eq(r(10))).toBe(true);
    expect(scoreMember(v).categories.pullups.isZero()).toBe(true);
  });

  it("pull-ups baseline of 0 reps is valid (B = 0)", () => {
    const v = memberSeasonValues(p("m", [
      { category: "pullups", performedOn: "2026-11-01", reps: 0 },
      { category: "pullups", performedOn: "2026-12-02", reps: 3 },
    ]), season);
    expect(v.baseline.pullups?.isZero()).toBe(true);
    expect(scoreMember(v).categories.pullups.eq(r(90))).toBe(true);
  });

  it("missing baseline in one category (non-rookie) → that category is 0 this season (D5)", () => {
    const v = memberSeasonValues(p("m", [
      { category: "bench", performedOn: "2026-11-01", weightKg: 60, reps: 5 },
      { category: "squat", performedOn: "2026-12-02", weightKg: 200, reps: 5 },
    ]), season);
    expect(v.isRookie).toBe(false);
    expect(scoreMember(v).categories.squat.isZero()).toBe(true);
  });

  it("voided entries are ignored for B, M and treadmill; voided best falls back to the next best", () => {
    const v = memberSeasonValues(p("m", [
      { category: "bench", performedOn: "2026-11-01", weightKg: 100, reps: 5, voided: true },
      { category: "bench", performedOn: "2026-11-02", weightKg: 60, reps: 5 },
      { category: "treadmill", performedOn: "2026-12-02", km: 5, voided: true },
    ]), season);
    expect(v.baseline.bench?.eq(r(70))).toBe(true);
    expect(v.treadmillKmByDay).toHaveLength(0);
  });

  it("decision 4: duplicate same-day treadmill entries (prevented by the DB) are summed, then capped at 5 km", () => {
    const days = (entries: ScoringEntry[]) => scoreMember(memberSeasonValues(p("m", entries), season)).categories.treadmill;
    // normal case: one entry per day → day_km is that entry's km
    expect(days([{ category: "treadmill", performedOn: "2026-12-01", km: 3 }]).eq(r(12))).toBe(true);
    // defensive: two entries on one day (cannot happen through the database) → 2 + 2 = 4 km
    expect(days([
      { category: "treadmill", performedOn: "2026-12-01", km: 2 },
      { category: "treadmill", performedOn: "2026-12-01", km: 2 },
    ]).eq(r(16))).toBe(true);
    // defensive: the 5 km daily cap applies to the day's sum, never per entry (4 + 4 → 5, not 8)
    expect(days([
      { category: "treadmill", performedOn: "2026-12-01", km: 4 },
      { category: "treadmill", performedOn: "2026-12-01", km: 4 },
    ]).eq(r(20))).toBe(true);
    // a voided duplicate is ignored entirely
    expect(days([
      { category: "treadmill", performedOn: "2026-12-01", km: 3 },
      { category: "treadmill", performedOn: "2026-12-01", km: 3, voided: true },
    ]).eq(r(12))).toBe(true);
  });

  it("treadmill: per-day amounts; entries before the season give no credit; daily cap 5 km (§3)", () => {
    const v = memberSeasonValues(p("m", [
      { category: "treadmill", performedOn: "2026-11-30", km: 5 },
      { category: "treadmill", performedOn: "2026-12-01", km: "3.5" },
      { category: "treadmill", performedOn: "2026-12-01", km: "2.5" }, // defensive: same day summed → 6 → credited 5
      { category: "treadmill", performedOn: "2026-12-02", km: "42.2" },
    ]), season);
    expect(v.treadmillKmByDay.map((k) => k.toNumber()).sort()).toEqual([42.2, 6]);
    expect(scoreMember(v).categories.treadmill.eq(r(40))).toBe(true); // (5 + 5) × 4
  });

  it("consistency counts distinct, non-voided attendance days inside the season", () => {
    const v = memberSeasonValues(p("m", [], {
      plannedSessions: 4,
      attendance: [
        { attendedOn: "2026-11-30" },                 // before
        { attendedOn: "2026-12-01" },
        { attendedOn: "2026-12-01" },                 // duplicate day
        { attendedOn: "2026-12-02", voided: true },
        { attendedOn: "2026-12-03" },
        { attendedOn: "2027-01-01" },                 // after
      ],
    }), season);
    expect(v.attendedDays).toBe(2);
    expect(scoreMember(v).categories.consistency.eq(r("33.3333333333333333333").max(r(100).div(r(3))))).toBe(true); // 2/4 × 4/12 × 200 = 100/3
  });
});

describe("rookies (§1, §4, BR-R1, BR-R2)", () => {
  it("rookie = no non-voided entry in ANY category before the season (treadmill counts; voided does not)", () => {
    expect(memberSeasonValues(p("a", [{ category: "treadmill", performedOn: "2026-11-30", km: 1 }]), season).isRookie).toBe(false);
    expect(memberSeasonValues(p("b", [{ category: "bench", performedOn: "2026-11-30", weightKg: 50, reps: 3, voided: true }]), season).isRookie).toBe(true);
    expect(memberSeasonValues(p("c", [], { attendance: [{ attendedOn: "2026-11-30" }] }), season).isRookie).toBe(true); // attendance is not an entry
  });

  it("rookies earn Treadmill + Consistency only and are listed separately, never on the main board", () => {
    const standings = scoreSeason(season, [
      p("vet", [{ category: "pushups", performedOn: "2026-11-01", reps: 10 }, { category: "pushups", performedOn: "2026-12-01", reps: 11 }]),
      p("rookie", [{ category: "pushups", performedOn: "2026-12-01", reps: 99 }, { category: "treadmill", performedOn: "2026-12-01", km: 5 }],
        { attendance: [{ attendedOn: "2026-12-01" }] }),
    ]);
    expect(standings.main.map((x) => x.memberId)).toEqual(["vet"]);
    expect(standings.rookies.map((x) => [x.memberId, x.rank])).toEqual([["rookie", 1]]);
    const rookie = standings.rookies[0];
    expect(rookie.categories.pushups.isZero()).toBe(true);
    expect(rookie.total.gt(standings.main[0].total)).toBe(true); // higher total, still not on the main board
    expect(winners(standings).map((x) => x.memberId)).toEqual(["vet"]);
  });
});

describe("rookies list ranking uses the §5 comparator (decision 3)", () => {
  // Rookies score only Treadmill + Consistency (improvement is always 0), so the §5
  // comparator reduces to total → consistency → shared rank.
  const rookie = (id: string, km: string, attendedDays: number, plannedSessions = 12) =>
    scoreMember(values({ memberId: id, isRookie: true, treadmill: [km], attendedDays, plannedSessions }));

  it("full ties share a rank (1, 1, 3); member ID only orders the display of tied rows", () => {
    const standings = rankSeason("championship", [
      rookie("z-rookie", "5", 6),      // 20 + 100 = 120
      rookie("a-rookie", "5", 6),      // 120, tied on every key with z-rookie
      rookie("m-rookie", "5", 3, 6),   // 20 + 50 = 70
      rookie("c-rookie", "5", 1, 4),   // 20 + 16.67 = 36.67
      rookie("b-rookie", "2.5", 0),    // 10
    ]);
    expect(standings.main).toHaveLength(0);
    expect(standings.rookies.map((x) => [x.memberId, x.rank])).toEqual([
      ["a-rookie", 1], ["z-rookie", 1], ["m-rookie", 3], ["c-rookie", 4], ["b-rookie", 5],
    ]);
  });

  it("equal totals are separated by consistency, never by member ID", () => {
    // both total 70; "z" has more consistency, "a" sorts first by ID
    const z = rookie("z", "5", 3, 6);                                                              // 20 + 50
    const a = scoreMember(values({ memberId: "a", isRookie: true, treadmill: ["5", "5", "5", "2.5"] })); // 70 + 0
    expect(z.total.eq(a.total)).toBe(true);
    expect(rankSeason("championship", [a, z]).rookies.map((r) => [r.memberId, r.rank])).toEqual([["z", 1], ["a", 2]]);
  });
});

describe("inactive participants (D29, BR-P5)", () => {
  const history = [
    p("a", [{ category: "pushups", performedOn: "2026-11-01", reps: 10 }, { category: "pushups", performedOn: "2026-12-01", reps: 20 }]),
    p("b", [{ category: "pushups", performedOn: "2026-11-01", reps: 10 }, { category: "pushups", performedOn: "2026-12-01", reps: 15 }]),
    p("gone", [{ category: "pushups", performedOn: "2026-11-01", reps: 10 }, { category: "pushups", performedOn: "2026-12-01", reps: 30 }], { isActive: false }),
    p("gone-rookie", [{ category: "treadmill", performedOn: "2026-12-01", km: 5 }], { isActive: false }),
  ];

  it("are scored with the same formulas but never ranked and never winners", () => {
    const standings = scoreSeason(season, history);
    expect(standings.unranked.map((x) => x.memberId).sort()).toEqual(["gone", "gone-rookie"]);
    const gone = standings.unranked.find((x) => x.memberId === "gone")!;
    expect(gone.categories.pushups.eq(r(150))).toBe(true); // best score of all, still unranked
    expect(standings.main.map((x) => [x.memberId, x.rank])).toEqual([["a", 1], ["b", 2]]);
    expect(standings.rookies).toHaveLength(0);
    expect(winners(standings).map((x) => x.memberId)).not.toContain("gone");
  });

  it("removing them changes nobody's rank", () => {
    const withThem = scoreSeason(season, history).main.map((x) => [x.memberId, x.rank]);
    const without = scoreSeason(season, history.filter((h) => h.isActive)).main.map((x) => [x.memberId, x.rank]);
    expect(withThem).toEqual(without);
  });
});

describe("preseason (§6, BR-S2, BR-S10)", () => {
  it("produces no points, no ranking and no winners", () => {
    const pre: SeasonWindow = { type: "preseason", startsOn: "2026-11-15", endsOn: "2026-11-30" };
    const standings = scoreSeason(pre, [p("a", [{ category: "pushups", performedOn: "2026-11-20", reps: 30 }])]);
    expect(standings).toEqual({ type: "preseason", main: [], rookies: [], unranked: [] });
    expect(winners(standings)).toEqual([]);
  });

  it("its entries become the baselines of the next championship", () => {
    const v = memberSeasonValues(p("a", [
      { category: "pushups", performedOn: "2026-11-20", reps: 30 },   // preseason
      { category: "pushups", performedOn: "2026-12-02", reps: 36 },   // Season 1
    ]), season);
    expect(v.isRookie).toBe(false);
    expect(scoreMember(v).categories.pushups.eq(r(90))).toBe(true);
  });
});

describe("ties and exact ranking (§5)", () => {
  it("mathematically equal totals are equal — no floating-point drift (0.1 + 0.2 = 0.3)", () => {
    expect(0.1 + 0.2 === 0.3).toBe(false); // why floats are not used
    const a = scoreMember(values({ memberId: "a", treadmill: ["0.1", "0.2"] }));
    const b = scoreMember(values({ memberId: "b", treadmill: ["0.3"] }));
    expect(a.total.eq(b.total)).toBe(true);
    expect(compareScores(a, b)).toBe(0);
    expect(rankSeason("championship", [a, b]).main.map((x) => x.rank)).toEqual([1, 1]);
  });

  it("equal via different categories (lift fraction vs. consistency fraction) still ties exactly", () => {
    // deadlift +1% of 100 → 100/15 = 6 2/3 points; consistency 2 of 12 → 200/6 = 33 1/3 … build equal totals:
    const a = scoreMember(values({ memberId: "a", baseline: { deadlift: 100 }, monthBest: { deadlift: 101 }, attendedDays: 0 }));
    const b = scoreMember(values({ memberId: "b", plannedSessions: 30, attendedDays: 1 }));
    expect(a.total.toString()).toBe("20/3");
    expect(b.total.toString()).toBe("20/3");
    // equal total; a has more improvement → a ranks first
    expect(rankSeason("championship", [b, a]).main.map((x) => [x.memberId, x.rank])).toEqual([["a", 1], ["b", 2]]);
  });

  it("totals that differ only beyond display precision are NOT tied (full precision)", () => {
    const a = scoreMember(values({ memberId: "a", baseline: { deadlift: 3000 }, monthBest: { deadlift: "3000.5" } })); // 1/9 point
    const b = scoreMember(values({ memberId: "b", baseline: { deadlift: 3000 }, monthBest: { deadlift: "3000.5" }, treadmill: [] }));
    const c = scoreMember(values({ memberId: "c", baseline: { deadlift: "3000.5" }, monthBest: { deadlift: "3001" } }));
    expect(a.total.roundHalfUp()).toBe(c.total.roundHalfUp()); // both display as 0
    expect(a.total.gt(c.total)).toBe(true);
    expect(rankSeason("championship", [c, b, a]).main.map((x) => [x.memberId, x.rank])).toEqual([["a", 1], ["b", 1], ["c", 3]]);
  });

  it("tie-break order: total → improvement → consistency → shared rank", () => {
    const mk = (memberId: string, improvement: number, consistency: number, treadmill: number) =>
      ({ ...scoreMember(values({ memberId })), total: r(improvement + consistency + treadmill), improvementPoints: r(improvement),
        categories: { ...scoreMember(values()).categories, consistency: r(consistency), treadmill: r(treadmill) } });
    const ranked = rankSeason("championship", [
      mk("t1", 100, 100, 0),  // 200
      mk("t2", 100, 50, 50),  // 200, same improvement, less consistency
      mk("t3", 150, 50, 0),   // 200, more improvement
      mk("t4", 100, 100, 0),  // full tie with t1
      mk("t5", 300, 0, 0),    // 300
    ]).main;
    expect(ranked.map((x) => [x.memberId, x.rank])).toEqual([["t5", 1], ["t3", 2], ["t1", 3], ["t4", 3], ["t2", 5]]);
  });

  it("output order is deterministic for full ties, even for identical rows", () => {
    const a = scoreMember(values({ memberId: "same", treadmill: [2] }));
    const ranked = rankSeason("championship", [a, { ...a }, scoreMember(values({ memberId: "other", treadmill: [2] }))]).main;
    expect(ranked.map((x) => [x.memberId, x.rank])).toEqual([["other", 1], ["same", 1], ["same", 1]]);
  });

  it("D10/BR-W1: ties inside the Top 3 are all winners", () => {
    const mk = (id: string, total: number) => scoreMember(values({ memberId: id, treadmill: [total / 4] }));
    const standings = rankSeason("championship", [mk("a", 20), mk("b", 16), mk("c", 16), mk("d", 16), mk("e", 4)]);
    expect(winners(standings).map((x) => [x.memberId, x.rank])).toEqual([["a", 1], ["b", 2], ["c", 2], ["d", 2]]);
  });

  it("display rounding is separate from ranking (726.15 → 726, ranking keeps 726.148…)", () => {
    const x = r("726.15");
    expect(x.roundHalfUp()).toBe(726);
    expect(r("726.5").roundHalfUp()).toBe(727);
    expect(x.gt(r(726))).toBe(true);
  });
});

describe("Rational arithmetic", () => {
  it("parses decimals exactly, including exponents and strings from the database", () => {
    expect(Rational.from("0.1").toString()).toBe("1/10");
    expect(Rational.from(0.1).toString()).toBe("1/10");
    expect(Rational.from("1.25e2").toString()).toBe("125");
    expect(Rational.from("125e-3").toString()).toBe("1/8");
    expect(Rational.from("-2.5").toString()).toBe("-5/2");
    expect(Rational.from(" 42.2 ").toString()).toBe("211/5");
    expect(Rational.from(Rational.ONE)).toBe(Rational.ONE);
  });

  it("rejects non-decimals and division by zero", () => {
    expect(() => Rational.from("abc")).toThrow(RangeError);
    expect(() => Rational.from(Number.NaN)).toThrow(RangeError);
    expect(() => Rational.from(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => Rational.int(1.5)).toThrow(RangeError);
    expect(() => Rational.ONE.div(Rational.ZERO)).toThrow(RangeError);
    expect(() => Rational.fraction(BigInt(1), BigInt(0))).toThrow(RangeError);
  });

  it("normalizes signs and fractions", () => {
    expect(Rational.fraction(BigInt(2), BigInt(-4)).toString()).toBe("-1/2");
    expect(Rational.fraction(BigInt(-6), BigInt(-4)).toString()).toBe("3/2");
    expect(Rational.int(3).sub(Rational.int(5)).toString()).toBe("-2");
    expect(r(2).lt(r(3))).toBe(true);
    expect(r(2).min(r(3)).eq(r(2))).toBe(true);
    expect(r(3).min(r(2)).eq(r(2))).toBe(true);
    expect(r(2).max(r(3)).eq(r(3))).toBe(true);
  });

  it("rounds half-up, including negatives, and formats fixed decimals for storage", () => {
    expect(r("-0.5").roundHalfUp()).toBe(0);
    expect(r("-0.6").roundHalfUp()).toBe(-1);
    expect(r("-1.5").roundHalfUp()).toBe(-1);
    expect(r("2.5").roundHalfUp()).toBe(3);
    expect(Rational.fraction(BigInt(665), BigInt(6)).toFixed(4)).toBe("110.8333");
    expect(Rational.fraction(BigInt(2), BigInt(3)).toFixed(4)).toBe("0.6667");
    expect(r("726.15").toFixed(0)).toBe("726");
    expect(r("-0.00004").toFixed(4)).toBe("0.0000");
    expect(r("-1.23456").toFixed(4)).toBe("-1.2346");
    expect(r(5).toFixed(2)).toBe("5.00");
  });
});
