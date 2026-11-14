/**
 * Scoring types (SCORING_SPECIFICATION). Pure data — no I/O, no clock.
 * Dates are Cairo calendar dates as ISO strings ("2026-11-14"), supplied by the caller.
 */
import type { Decimal, Rational } from "./rational";

export type IsoDate = string;

/** Logged categories (Consistency is derived from attendance, not logged). */
export type CategoryCode = "deadlift" | "bench" | "squat" | "pullups" | "pushups" | "treadmill";
/** Test categories: scored against the member's own baseline (§1). */
export type TestCategory = "deadlift" | "bench" | "squat" | "pullups" | "pushups";
export type LiftCategory = "deadlift" | "bench" | "squat";
/** The seven scoring categories, 1000 points in total (§3). */
export type ScoreCategory = TestCategory | "treadmill" | "consistency";

export type SeasonType = "preseason" | "championship";

export interface SeasonWindow {
  type: SeasonType;
  /** inclusive, Cairo date */
  startsOn: IsoDate;
  /** inclusive, Cairo date */
  endsOn: IsoDate;
}

/** One logged result. Raw inputs are used, so values are exact (never the rounded DB `value`). */
export interface ScoringEntry {
  category: CategoryCode;
  performedOn: IsoDate;
  weightKg?: Decimal | null;
  reps?: number | null;
  km?: Decimal | null;
  /** Voided entries are ignored everywhere (§1). */
  voided?: boolean;
}

export interface AttendanceRecord {
  attendedOn: IsoDate;
  voided?: boolean;
}

/** Everything the scoring module needs about one season participant. */
export interface ParticipantHistory {
  memberId: string;
  /** D29: inactive members are scored but never ranked. */
  isActive: boolean;
  /** season_participants.planned_sessions (1–31) */
  plannedSessions: number;
  /** ALL of the member's entries, including those before the season (baselines). */
  entries: readonly ScoringEntry[];
  attendance: readonly AttendanceRecord[];
}

/** Per-member inputs to the formulas, after reading the entries (§1). */
export interface MemberSeasonValues {
  memberId: string;
  isActive: boolean;
  isRookie: boolean;
  plannedSessions: number;
  /** distinct non-voided attendance days within the season */
  attendedDays: number;
  /** B per test category; absent/null = no baseline */
  baseline: Partial<Record<TestCategory, Rational | null>>;
  /** M per test category; absent/null = no entry this season */
  monthBest: Partial<Record<TestCategory, Rational | null>>;
  /** km logged per season day (one value per day) */
  treadmillKmByDay: readonly Rational[];
}

export type CategoryPoints = Record<ScoreCategory, Rational>;

export interface MemberScore {
  memberId: string;
  isActive: boolean;
  isRookie: boolean;
  categories: CategoryPoints;
  /** Deadlift + Bench + Squat + Pull-ups + Push-ups (§5) */
  improvementPoints: Rational;
  /** improvement + Treadmill + Consistency, 0..1000 (§5) */
  total: Rational;
  /** For the frozen-results audit columns (baseline_json / month_best_json). */
  baseline: Partial<Record<TestCategory, Rational | null>>;
  monthBest: Partial<Record<TestCategory, Rational | null>>;
}

export interface RankedRow extends MemberScore {
  /** standard competition rank: 1, 1, 3 (§5) */
  rank: number;
}

export interface SeasonStandings {
  type: SeasonType;
  /** active, non-rookie participants, ranked (§5) */
  main: RankedRow[];
  /** active rookies, ranked separately; never on the main board or Top 3 (BR-R2) */
  rookies: RankedRow[];
  /** D29: participants inactive at scoring time — scored, never ranked */
  unranked: MemberScore[];
}
