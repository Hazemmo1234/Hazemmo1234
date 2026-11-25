/**
 * Entry preview and the photo rule — SCORING_SPECIFICATION §6, BR-E6, UX C4.
 * Pure: "today" (Cairo) is supplied by the caller from lib/time.ts.
 */
import { entryValue, validateEntry, type EntryInput, type EntryValidationError } from "./entry";
import { Rational } from "./rational";
import { isTestCategoryAtCap, treadmillCreditedKm } from "./points";
import { TREADMILL_SEASON_CAP_KM, isTestCategory } from "./rules";
import { memberSeasonValues, scoreMember } from "./season";
import type { IsoDate, MemberSeasonValues, ParticipantHistory, ScoreCategory, SeasonWindow } from "./types";

/**
 * §6: an entry requires a photo if saving it would increase the member's season total:
 * - test category: non-rookie, B not null, value > max(B, current M), category not at cap;
 * - treadmill: credited km so far < 50.
 * Otherwise optional. Never during a preseason. Attendance never needs a photo — including
 * the attendance an entry records automatically, even when that raises Consistency and
 * the season total (owner decision on §6, M1 review).
 */
export function isPhotoRequired(season: SeasonWindow, values: MemberSeasonValues, category: EntryInput["category"], value: Rational): boolean {
  if (season.type === "preseason") return false;
  if (!isTestCategory(category)) return treadmillCreditedKm(values.treadmillKmByDay).lt(TREADMILL_SEASON_CAP_KM);
  if (values.isRookie) return false;
  const baseline = values.baseline[category];
  if (!baseline) return false;
  const monthBest = values.monthBest[category];
  const best = monthBest ? baseline.max(monthBest) : baseline;
  return value.gt(best) && !isTestCategoryAtCap(category, baseline, monthBest);
}

export interface EntryPreview {
  /** e1RM (kg) for lifts, reps for pull/push-ups, km for treadmill — exact */
  value: Rational;
  /**
   * New best / "PR": the value exceeds the member's previous highest recorded value in
   * this category, including the established baseline (B) and earlier entries this
   * season (M); voided entries are not "recorded". A first-ever value has nothing to
   * beat and is not a PR. Treadmill entries are never PRs. (Owner decision, M1 review.)
   */
  isNewBest: boolean;
  category: ScoreCategory;
  categoryPointsBefore: Rational;
  categoryPointsAfter: Rational;
  totalBefore: Rational;
  /** includes the attendance this entry records automatically (BR-E7) */
  totalAfter: Rational;
  pointsDelta: Rational;
  photoRequired: boolean;
}

export type PreviewResult = { ok: true; preview: EntryPreview } | { ok: false; errors: EntryValidationError[] };

/**
 * What saving this entry today would do. Simulates exactly what the server writes:
 * the entry on `today`, plus an automatic attendance row if none exists for today.
 * During a preseason all points are 0 (no points in a preseason, §6).
 */
export function previewEntry(params: {
  season: SeasonWindow;
  participant: ParticipantHistory;
  entry: EntryInput;
  today: IsoDate;
}): PreviewResult {
  const { season, participant, entry, today } = params;
  const errors = validateEntry(entry);
  if (errors.length > 0) return { ok: false, errors };

  const value = entryValue(entry);
  const before = memberSeasonValues(participant, season);
  const after = memberSeasonValues(
    {
      ...participant,
      entries: [...participant.entries, { ...entry, performedOn: today }],
      attendance: [...participant.attendance, { attendedOn: today }],
    },
    season,
  );

  let isNewBest = false;
  if (isTestCategory(entry.category)) {
    const previous = [before.baseline[entry.category], before.monthBest[entry.category]].filter((v): v is Rational => !!v);
    isNewBest = previous.length > 0 && previous.every((v) => value.gt(v));
  }

  const scoredBefore = scoreMember(before);
  const scoredAfter = scoreMember(after);
  const preseason = season.type === "preseason";
  const pick = (r: Rational) => (preseason ? Rational.ZERO : r);
  const totalBefore = pick(scoredBefore.total);
  const totalAfter = pick(scoredAfter.total);

  return {
    ok: true,
    preview: {
      value,
      isNewBest,
      category: entry.category,
      categoryPointsBefore: pick(scoredBefore.categories[entry.category]),
      categoryPointsAfter: pick(scoredAfter.categories[entry.category]),
      totalBefore,
      totalAfter,
      pointsDelta: totalAfter.sub(totalBefore),
      photoRequired: isPhotoRequired(season, before, entry.category, value),
    },
  };
}
