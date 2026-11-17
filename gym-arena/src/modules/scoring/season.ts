/**
 * Season scoring and ranking — SCORING_SPECIFICATION §1, §3–§5; D29.
 * One function powers the coach preview, admin view, TV and frozen results (AC-20).
 */
import { entryValue } from "./entry";
import { Rational, sum } from "./rational";
import { consistencyPoints, testCategoryPoints, treadmillPoints } from "./points";
import { SCORE_CATEGORIES, TEST_CATEGORIES, isTestCategory } from "./rules";
import type {
  CategoryPoints,
  IsoDate,
  MemberScore,
  MemberSeasonValues,
  ParticipantHistory,
  RankedRow,
  SeasonStandings,
  SeasonWindow,
  TestCategory,
} from "./types";

const isWithin = (day: IsoDate, season: SeasonWindow) => day >= season.startsOn && day <= season.endsOn;

/**
 * Reads a participant's entries and attendance into the formula inputs (§1):
 * - B = max value of non-voided entries with performed_on < starts_on
 * - M = max value of non-voided entries with starts_on ≤ performed_on ≤ ends_on
 * - Rookie = zero non-voided entries in any category before starts_on
 * - attended = distinct non-voided attendance days within the season
 */
export function memberSeasonValues(participant: ParticipantHistory, season: SeasonWindow): MemberSeasonValues {
  const baseline: Partial<Record<TestCategory, Rational>> = {};
  const monthBest: Partial<Record<TestCategory, Rational>> = {};
  const kmByDay = new Map<IsoDate, Rational>();
  let hasEntryBeforeSeason = false;

  for (const entry of participant.entries) {
    if (entry.voided) continue; // §1: voided entries are ignored everywhere
    const before = entry.performedOn < season.startsOn;
    const inSeason = isWithin(entry.performedOn, season);
    if (before) hasEntryBeforeSeason = true;
    if (!before && !inSeason) continue; // after the season: not part of this season

    const value = entryValue(entry);
    if (isTestCategory(entry.category)) {
      const bucket = before ? baseline : monthBest;
      const current = bucket[entry.category];
      bucket[entry.category] = current ? current.max(value) : value;
    } else if (inSeason) {
      // Treadmill: the database allows one non-voided entry per member per day (BR-E2, unique
      // index entries_one_per_day), so day_km is that entry's km (§3). Summing same-day
      // entries is purely defensive; the 5 km daily cap then applies to the day's sum.
      const day = kmByDay.get(entry.performedOn) ?? Rational.ZERO;
      kmByDay.set(entry.performedOn, day.add(value));
    }
  }

  const attendedDays = new Set(
    participant.attendance.filter((a) => !a.voided && isWithin(a.attendedOn, season)).map((a) => a.attendedOn),
  ).size;

  return {
    memberId: participant.memberId,
    isActive: participant.isActive,
    isRookie: !hasEntryBeforeSeason,
    plannedSessions: participant.plannedSessions,
    attendedDays,
    baseline,
    monthBest,
    treadmillKmByDay: [...kmByDay.values()],
  };
}

/** Scores one member (§3–§5). Rookies earn Treadmill + Consistency only (§4, BR-R2). */
export function scoreMember(values: MemberSeasonValues): MemberScore {
  const categories = {} as CategoryPoints;
  for (const category of TEST_CATEGORIES) {
    categories[category] = values.isRookie
      ? Rational.ZERO
      : testCategoryPoints(category, values.baseline[category], values.monthBest[category]);
  }
  categories.treadmill = treadmillPoints(values.treadmillKmByDay);
  categories.consistency = consistencyPoints(values.attendedDays, values.plannedSessions);

  const improvementPoints = sum(TEST_CATEGORIES.map((c) => categories[c]));
  const total = sum(SCORE_CATEGORIES.map((c) => categories[c]));
  return {
    memberId: values.memberId,
    isActive: values.isActive,
    isRookie: values.isRookie,
    categories,
    improvementPoints,
    total,
    baseline: { ...values.baseline },
    monthBest: { ...values.monthBest },
  };
}

/**
 * Ranking order (§5): total desc → improvement desc → consistency desc. Exact
 * comparison on full-precision rationals. Returns 0 when all three are equal.
 */
export function compareScores(a: MemberScore, b: MemberScore): number {
  return (
    b.total.cmp(a.total) ||
    b.improvementPoints.cmp(a.improvementPoints) ||
    b.categories.consistency.cmp(a.categories.consistency)
  );
}

/**
 * Standard competition ranking (1, 1, 3): equal on all three keys → same rank, and the
 * next rank skips (§5). Members equal on all keys are listed by memberId only so the
 * output order is deterministic; this never affects their (shared) rank.
 */
export function rankScores(scores: readonly MemberScore[]): RankedRow[] {
  const sorted = [...scores].sort((a, b) => compareScores(a, b) || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
  const ranked: RankedRow[] = [];
  sorted.forEach((score, index) => {
    const previous = ranked[index - 1];
    const rank = previous && compareScores(previous, score) === 0 ? previous.rank : index + 1;
    ranked.push({ ...score, rank });
  });
  return ranked;
}

/**
 * Splits and ranks a season (§4–§5, D29):
 * - main board: active non-rookies
 * - rookies list: active rookies (never on the main board or Top 3)
 * - unranked: inactive participants — scored with the same formulas, never ranked
 */
export function rankSeason(type: SeasonStandings["type"], scores: readonly MemberScore[]): SeasonStandings {
  return {
    type,
    main: rankScores(scores.filter((s) => s.isActive && !s.isRookie)),
    rookies: rankScores(scores.filter((s) => s.isActive && s.isRookie)),
    unranked: scores.filter((s) => !s.isActive),
  };
}

/**
 * Full season computation from raw participant histories.
 * A preseason produces no points, no ranking and no winners (§6, BR-S10): its entries
 * only become baselines for the next championship.
 */
export function scoreSeason(season: SeasonWindow, participants: readonly ParticipantHistory[]): SeasonStandings {
  if (season.type === "preseason") return { type: "preseason", main: [], rookies: [], unranked: [] };
  return rankSeason(
    season.type,
    participants.map((p) => scoreMember(memberSeasonValues(p, season))),
  );
}

/** Top 3 = ranks 1–3 on the main board; ties may produce more than three winners (BR-W1, D10). */
export function winners(standings: SeasonStandings): RankedRow[] {
  return standings.main.filter((row) => row.rank <= 3);
}
