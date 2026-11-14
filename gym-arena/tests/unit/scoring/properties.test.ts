/**
 * Property-based tests (TEST_PLAN "Scoring unit tests"): bounds, monotonicity, caps,
 * void fallback, D29 rank independence, order independence. fast-check, fixed seed
 * so CI runs are reproducible.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_MAX,
  Rational,
  SCORE_CATEGORIES,
  memberSeasonValues,
  scoreMember,
  scoreSeason,
  type AttendanceRecord,
  type ParticipantHistory,
  type ScoringEntry,
  type SeasonWindow,
} from "@/modules/scoring";

fc.configureGlobal({ seed: 20261114, numRuns: 300 });

const season: SeasonWindow = { type: "championship", startsOn: "2026-12-01", endsOn: "2026-12-31" };
const day = (from: number, to: number) => fc.integer({ min: from, max: to }).map((d) => {
  const date = new Date(Date.UTC(2026, 10, 1) + d * 86_400_000); // day 0 = 2026-11-01
  return date.toISOString().slice(0, 10);
});
const beforeDay = day(0, 29);      // November (baseline window)
const inSeasonDay = day(30, 60);   // December (season)

const liftEntry = (performedOn: fc.Arbitrary<string>) => fc.record({
  category: fc.constantFrom("deadlift" as const, "bench" as const, "squat" as const),
  performedOn,
  weightKg: fc.integer({ min: 1, max: 1000 }).map((half) => (half / 2).toString()),
  reps: fc.constantFrom(3, 4, 5),
  voided: fc.boolean(),
});
const repsEntry = (performedOn: fc.Arbitrary<string>) => fc.oneof(
  fc.record({ category: fc.constant("pullups" as const), performedOn, reps: fc.integer({ min: 0, max: 100 }), voided: fc.boolean() }),
  fc.record({ category: fc.constant("pushups" as const), performedOn, reps: fc.integer({ min: 0, max: 300 }), voided: fc.boolean() }),
);
const treadmillEntry = (performedOn: fc.Arbitrary<string>) => fc.record({
  category: fc.constant("treadmill" as const),
  performedOn,
  km: fc.integer({ min: 1, max: 422 }).map((tenths) => (tenths / 10).toString()),
  voided: fc.boolean(),
});
const anyEntry = (performedOn: fc.Arbitrary<string>): fc.Arbitrary<ScoringEntry> =>
  fc.oneof(liftEntry(performedOn), repsEntry(performedOn), treadmillEntry(performedOn));

const attendanceArb: fc.Arbitrary<AttendanceRecord[]> = fc.array(
  fc.record({ attendedOn: inSeasonDay, voided: fc.boolean() }), { maxLength: 40 });

const participantArb = (memberId: fc.Arbitrary<string> = fc.constant("m")): fc.Arbitrary<ParticipantHistory> => fc.record({
  memberId,
  isActive: fc.boolean(),
  plannedSessions: fc.integer({ min: 1, max: 31 }),
  entries: fc.array(fc.oneof(anyEntry(beforeDay), anyEntry(inSeasonDay)), { maxLength: 40 }),
  attendance: attendanceArb,
});

const scoreOf = (p: ParticipantHistory) => scoreMember(memberSeasonValues(p, season));

describe("scoring properties", () => {
  it("total ∈ [0, 1000]; every category ∈ [0, its max]; total = Σ categories", () => {
    fc.assert(fc.property(participantArb(), (p) => {
      const s = scoreOf(p);
      expect(s.total.lt(Rational.ZERO)).toBe(false);
      expect(s.total.gt(Rational.int(1000))).toBe(false);
      let sum = Rational.ZERO;
      for (const c of SCORE_CATEGORIES) {
        expect(s.categories[c].lt(Rational.ZERO), c).toBe(false);
        expect(s.categories[c].gt(Rational.int(CATEGORY_MAX[c])), c).toBe(false);
        sum = sum.add(s.categories[c]);
      }
      expect(sum.eq(s.total)).toBe(true);
    }));
  });

  it("adding an in-season entry (and its attendance) never decreases the total", () => {
    fc.assert(fc.property(participantArb(), anyEntry(inSeasonDay), (p, extra) => {
      const entry = { ...extra, voided: false };
      const after = { ...p, entries: [...p.entries, entry], attendance: [...p.attendance, { attendedOn: entry.performedOn }] };
      expect(scoreOf(after).total.lt(scoreOf(p).total)).toBe(false);
    }));
  });

  it("an in-season entry never changes rookie status; a voided entry changes nothing at all", () => {
    fc.assert(fc.property(participantArb(), anyEntry(inSeasonDay), anyEntry(beforeDay), (p, inSeason, before) => {
      const base = scoreOf(p);
      expect(scoreOf({ ...p, entries: [...p.entries, { ...inSeason, voided: false }] }).isRookie).toBe(base.isRookie);
      const withVoided = scoreOf({ ...p, entries: [...p.entries, { ...inSeason, voided: true }, { ...before, voided: true }] });
      expect(withVoided.total.eq(base.total)).toBe(true);
      expect(withVoided.isRookie).toBe(base.isRookie);
    }));
  });

  it("voiding the best month entry falls back to the next best", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 300 }), { minLength: 2, maxLength: 10 }), (reps) => {
      const entries: ScoringEntry[] = reps.map((n, i) => ({ category: "pushups", performedOn: `2026-12-${String(i + 1).padStart(2, "0")}`, reps: n }));
      const best = Math.max(...reps);
      const bestIndex = reps.indexOf(best);
      const rest = reps.filter((_, i) => i !== bestIndex);
      const voided = entries.map((e, i) => (i === bestIndex ? { ...e, voided: true } : e));
      const v = memberSeasonValues({ memberId: "m", isActive: true, plannedSessions: 12, attendance: [], entries: voided }, season);
      expect(v.monthBest.pushups?.eq(Rational.int(Math.max(...rest)))).toBe(true);
    }));
  });

  it("caps hold however far the member improves (lifts 15%, pull-ups 5, push-ups 10, treadmill 50 km)", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 400 }), fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 300 }), (w, pu, ps) => {
      const p: ParticipantHistory = {
        memberId: "m", isActive: true, plannedSessions: 12, attendance: [],
        entries: [
          { category: "squat", performedOn: "2026-11-01", weightKg: w, reps: 3 },
          { category: "squat", performedOn: "2026-12-01", weightKg: 500, reps: 5 },
          { category: "pullups", performedOn: "2026-11-01", reps: Math.min(pu, 95) },
          { category: "pullups", performedOn: "2026-12-01", reps: 100 },
          { category: "pushups", performedOn: "2026-11-01", reps: Math.min(ps, 290) },
          { category: "pushups", performedOn: "2026-12-01", reps: 300 },
          ...Array.from({ length: 31 }, (_, i) => ({ category: "treadmill" as const, performedOn: `2026-12-${String(i + 1).padStart(2, "0")}`, km: "42.2" })),
        ],
      };
      const s = scoreOf(p);
      expect(s.categories.squat.eq(Rational.int(100))).toBe(true);
      expect(s.categories.pullups.eq(Rational.int(150))).toBe(true);
      expect(s.categories.pushups.eq(Rational.int(150))).toBe(true);
      expect(s.categories.treadmill.eq(Rational.int(200))).toBe(true);
    }));
  });

  it("rookies never score test categories", () => {
    fc.assert(fc.property(fc.array(anyEntry(inSeasonDay), { maxLength: 30 }), attendanceArb, (entries, attendance) => {
      const s = scoreOf({ memberId: "r", isActive: true, plannedSessions: 12, entries, attendance });
      expect(s.isRookie).toBe(true);
      expect(s.improvementPoints.isZero()).toBe(true);
    }));
  });

  const seasonArb = fc.uniqueArray(participantArb(fc.string({ minLength: 1, maxLength: 6 })), {
    selector: (p) => p.memberId, minLength: 1, maxLength: 12,
  });

  it("ranking does not depend on input order", () => {
    fc.assert(fc.property(seasonArb, fc.integer(), (participants, shift) => {
      const rotated = participants.map((_, i) => participants[(i + Math.abs(shift)) % participants.length]);
      const a = scoreSeason(season, participants);
      const b = scoreSeason(season, rotated);
      const key = (rows: { memberId: string; rank: number }[]) => rows.map((r) => `${r.memberId}:${r.rank}`);
      expect(key(b.main)).toEqual(key(a.main));
      expect(key(b.rookies)).toEqual(key(a.rookies));
    }));
  });

  it("D29: inactive participants never get a rank and removing them changes no rank", () => {
    fc.assert(fc.property(seasonArb, (participants) => {
      const all = scoreSeason(season, participants);
      const activeOnly = scoreSeason(season, participants.filter((p) => p.isActive));
      const ranks = (s: typeof all) => [...s.main, ...s.rookies].map((r) => `${r.memberId}:${r.rank}`).sort();
      expect(ranks(all)).toEqual(ranks(activeOnly));
      expect([...all.main, ...all.rookies].every((r) => r.isActive)).toBe(true);
      expect(all.unranked.length).toBe(participants.filter((p) => !p.isActive).length);
    }));
  });

  it("ranks follow the comparator: no one ranks above a strictly better total", () => {
    fc.assert(fc.property(seasonArb, (participants) => {
      const { main } = scoreSeason(season, participants);
      for (let i = 1; i < main.length; i++) {
        expect(main[i - 1].total.lt(main[i].total)).toBe(false);
        expect(main[i].rank >= main[i - 1].rank).toBe(true);
        if (main[i].total.lt(main[i - 1].total)) expect(main[i].rank).toBe(i + 1);
      }
    }));
  });
});
