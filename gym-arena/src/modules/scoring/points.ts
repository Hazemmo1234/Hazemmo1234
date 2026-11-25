/**
 * Category points — SCORING_SPECIFICATION §3. Exact; no negative points (§3 Rules).
 */
import { Rational, sum } from "./rational";
import {
  CATEGORY_MAX,
  CONSISTENCY_FULL_PLAN,
  LIFT_MAX_IMPROVEMENT_PERCENT,
  PLANNED_SESSIONS_MAX,
  PLANNED_SESSIONS_MIN,
  PULLUPS_MAX_GAIN,
  PULLUPS_POINTS_PER_REP,
  PUSHUPS_MAX_GAIN,
  PUSHUPS_POINTS_PER_REP,
  TREADMILL_DAILY_CAP_KM,
  TREADMILL_POINTS_PER_KM,
  TREADMILL_SEASON_CAP_KM,
  isLift,
} from "./rules";
import type { TestCategory } from "./types";

const hundred = Rational.int(100);

/** Lift improvement in percent: (M − B) / B × 100. */
export function liftImprovementPercent(baseline: Rational, monthBest: Rational): Rational {
  return monthBest.sub(baseline).div(baseline).mul(hundred);
}

/**
 * Points for one test category (§3). A missing baseline or no entry this season scores
 * 0; a result below baseline scores 0 and never lowers anything (no negative points).
 */
export function testCategoryPoints(category: TestCategory, baseline: Rational | null | undefined, monthBest: Rational | null | undefined): Rational {
  if (baseline === null || baseline === undefined || monthBest === null || monthBest === undefined) return Rational.ZERO;
  if (isLift(category)) {
    // e1RM is always > 0 for a valid lift; guard against division by zero anyway.
    if (!baseline.gt(Rational.ZERO)) return Rational.ZERO;
    const percent = liftImprovementPercent(baseline, monthBest).clamp(Rational.ZERO, LIFT_MAX_IMPROVEMENT_PERCENT);
    return percent.div(LIFT_MAX_IMPROVEMENT_PERCENT).mul(Rational.int(CATEGORY_MAX[category]));
  }
  if (category === "pullups") {
    return monthBest.sub(baseline).clamp(Rational.ZERO, PULLUPS_MAX_GAIN).mul(PULLUPS_POINTS_PER_REP);
  }
  return monthBest.sub(baseline).clamp(Rational.ZERO, PUSHUPS_MAX_GAIN).mul(PUSHUPS_POINTS_PER_REP);
}

/** True when the category already earns its maximum points (used by the photo rule, §6). */
export function isTestCategoryAtCap(category: TestCategory, baseline: Rational | null | undefined, monthBest: Rational | null | undefined): boolean {
  return testCategoryPoints(category, baseline, monthBest).eq(Rational.int(CATEGORY_MAX[category]));
}

/** Credited km: Σ over season days of min(day_km, 5), capped at 50 (§3). */
export function treadmillCreditedKm(kmByDay: readonly Rational[]): Rational {
  return sum(kmByDay.map((km) => km.clamp(Rational.ZERO, TREADMILL_DAILY_CAP_KM))).min(TREADMILL_SEASON_CAP_KM);
}

/** Treadmill points = credited km × 4, max 200 (§3). No baseline needed. */
export function treadmillPoints(kmByDay: readonly Rational[]): Rational {
  return treadmillCreditedKm(kmByDay).mul(TREADMILL_POINTS_PER_KM);
}

/**
 * Consistency = min(attended / planned, 1) × min(planned / 12, 1) × 200 (§3).
 * Attending more than planned never exceeds 200 (D6).
 */
export function consistencyPoints(attendedDays: number, plannedSessions: number): Rational {
  if (!Number.isInteger(plannedSessions) || plannedSessions < PLANNED_SESSIONS_MIN || plannedSessions > PLANNED_SESSIONS_MAX) {
    throw new RangeError(`planned_sessions must be an integer ${PLANNED_SESSIONS_MIN}–${PLANNED_SESSIONS_MAX}, got ${plannedSessions}`);
  }
  if (!Number.isInteger(attendedDays) || attendedDays < 0) {
    throw new RangeError(`attended days must be a non-negative integer, got ${attendedDays}`);
  }
  const planned = Rational.int(plannedSessions);
  const ratio = Rational.int(attendedDays).div(planned).min(Rational.ONE);
  const planFactor = planned.div(CONSISTENCY_FULL_PLAN).min(Rational.ONE);
  return ratio.mul(planFactor).mul(Rational.int(CATEGORY_MAX.consistency));
}
