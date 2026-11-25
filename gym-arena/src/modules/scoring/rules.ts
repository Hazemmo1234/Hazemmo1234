/**
 * Scoring constants — SCORING_SPECIFICATION §2–§3. Formulas are code constants and
 * change only between seasons (D11).
 */
import { Rational } from "./rational";
import type { CategoryCode, LiftCategory, ScoreCategory, TestCategory } from "./types";

export const LIFT_CATEGORIES: readonly LiftCategory[] = ["deadlift", "bench", "squat"];
export const TEST_CATEGORIES: readonly TestCategory[] = ["deadlift", "bench", "squat", "pullups", "pushups"];
export const CATEGORY_CODES: readonly CategoryCode[] = [...TEST_CATEGORIES, "treadmill"];
export const SCORE_CATEGORIES: readonly ScoreCategory[] = [...TEST_CATEGORIES, "treadmill", "consistency"];

/** Points available per category: 100+100+100+150+150+200+200 = 1000 (§3). */
export const CATEGORY_MAX: Readonly<Record<ScoreCategory, number>> = {
  deadlift: 100,
  bench: 100,
  squat: 100,
  pullups: 150,
  pushups: 150,
  treadmill: 200,
  consistency: 200,
};

export const MAX_TOTAL = 1000;

/** Lifts: +15% over baseline earns the full 100 points (§3). */
export const LIFT_MAX_IMPROVEMENT_PERCENT = Rational.int(15);
/** Pull-ups: +5 reps × 30 points = 150 (§3). */
export const PULLUPS_MAX_GAIN = Rational.int(5);
export const PULLUPS_POINTS_PER_REP = Rational.int(30);
/** Push-ups: +10 reps × 15 points = 150 (§3). */
export const PUSHUPS_MAX_GAIN = Rational.int(10);
export const PUSHUPS_POINTS_PER_REP = Rational.int(15);
/** Treadmill: at most 5 km credited per day, 50 km per season, 4 points per km (§3). */
export const TREADMILL_DAILY_CAP_KM = Rational.int(5);
export const TREADMILL_SEASON_CAP_KM = Rational.int(50);
export const TREADMILL_POINTS_PER_KM = Rational.int(4);
/** Consistency: full credit needs a plan of at least 12 sessions (§3). */
export const CONSISTENCY_FULL_PLAN = Rational.int(12);

/** Input limits — SCORING §2, BR-E4. */
export const LIFT_REPS: readonly number[] = [3, 4, 5];
export const LIFT_WEIGHT_STEP_KG = Rational.from("0.5");
export const LIFT_WEIGHT_MAX_KG = Rational.int(500);
export const PULLUPS_REPS_MAX = 100;
export const PUSHUPS_REPS_MAX = 300;
export const TREADMILL_KM_MIN = Rational.from("0.1");
export const TREADMILL_KM_MAX = Rational.from("42.2");
export const TREADMILL_KM_STEP = Rational.from("0.1");
export const PLANNED_SESSIONS_MIN = 1;
export const PLANNED_SESSIONS_MAX = 31;

export function isLift(category: CategoryCode): category is LiftCategory {
  return (LIFT_CATEGORIES as readonly string[]).includes(category);
}

export function isTestCategory(category: CategoryCode): category is TestCategory {
  return (TEST_CATEGORIES as readonly string[]).includes(category);
}
