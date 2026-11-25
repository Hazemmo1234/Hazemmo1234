/**
 * Member season card (API_SPECIFICATION "Member season card", UX C3) and the entry
 * preview payload (UX C4). Pure: every number comes from `modules/scoring` — the single
 * implementation of SCORING_SPECIFICATION (D14). Nothing here recalculates points.
 *
 * Numbers sent to the client: exact values rounded half-up for display only
 * (`toFixed(2)` / `roundHalfUp()`), never used for ranking (SCORING §5).
 */
import {
  CATEGORY_CODES,
  CATEGORY_MAX,
  Rational,
  TREADMILL_SEASON_CAP_KM,
  entryValue,
  isPhotoRequired,
  isTestCategory,
  isTestCategoryAtCap,
  memberSeasonValues,
  previewEntry,
  scoreMember,
  treadmillCreditedKm,
  type CategoryCode,
  type EntryInput,
  type EntryValidationError,
  type IsoDate,
  type ParticipantHistory,
  type ScoringEntry,
  type SeasonType,
  type SeasonWindow,
} from "@/modules/scoring";

/** A season as the cards need it (status is derived by the caller from the dates). */
export interface CardSeason {
  id: string;
  name: string;
  type: SeasonType;
  starts_on: IsoDate;
  ends_on: IsoDate;
  status: "scheduled" | "active" | "ended" | "closed";
  days_left: number;
}

export interface CategoryTile {
  code: CategoryCode;
  /** B — display value (e1RM kg, reps or km); null = no baseline */
  baseline: string | null;
  /** M — best this season; for the treadmill: credited km this season */
  month_best: string | null;
  points: number;
  /** points rounded half-up from the exact value — what the UI shows (never double-rounded) */
  points_display: number;
  max: number;
  logged_today: boolean;
  has_baseline: boolean;
  at_cap: boolean;
}

export interface TodayEntry {
  id: string;
  category: CategoryCode;
  value: string;
  weight_kg: string | null;
  reps: number | null;
  km: string | null;
  created_at: string;
  has_photo: boolean;
  voided: boolean;
  /** BR-E9: only the coach who submitted it, same day, not yet voided */
  can_undo: boolean;
}

export interface MemberCard {
  season: CardSeason | null;
  is_rookie: boolean;
  /** exact total, 2 decimals */
  total: number;
  /** total rounded half-up — what the UI shows */
  total_display: number;
  /**
   * Live rank in the member's list (main board, or rookies when is_rookie) and the size of
   * that list — the same numbers as the leaderboard (AC-20). Null in a preseason, between
   * seasons, or for a member not ranked (inactive).
   */
  rank: number | null;
  rank_of: number | null;
  planned_sessions: number;
  attended: number;
  attended_today: boolean;
  consistency: { points: number; points_display: number; max: number };
  categories: CategoryTile[];
  today_entries: TodayEntry[];
}

/** One entry row as loaded from the database (raw inputs as strings for exactness). */
export interface EntryRecord {
  id: string;
  member_id: string;
  category: CategoryCode;
  performed_on: IsoDate;
  weight_kg: string | null;
  reps: number | null;
  km: string | null;
  photo_path: string | null;
  logged_by: string;
  created_at: string;
  voided_at: string | null;
}

export interface AttendanceRecordRow {
  member_id: string;
  attended_on: IsoDate;
  voided_at: string | null;
  created_at?: string;
}

const num = (r: Rational) => Number(r.toFixed(2));

/** Display string of an entry's comparable value: e1RM 1 decimal, reps integer, km 1 decimal. */
export function formatValue(category: CategoryCode, value: Rational): string {
  if (category === "pullups" || category === "pushups") return value.toFixed(0);
  return value.toFixed(1);
}

export function toScoringEntry(e: EntryRecord): ScoringEntry {
  return { category: e.category, performedOn: e.performed_on, weightKg: e.weight_kg, reps: e.reps, km: e.km, voided: e.voided_at !== null };
}

export function toWindow(season: Pick<CardSeason, "type" | "starts_on" | "ends_on">): SeasonWindow {
  return { type: season.type, startsOn: season.starts_on, endsOn: season.ends_on };
}

/** Builds the scoring input for one member from database rows. */
export function participantHistory(
  memberId: string,
  plannedSessions: number,
  entries: readonly EntryRecord[],
  attendance: readonly AttendanceRecordRow[],
): ParticipantHistory {
  return {
    memberId,
    isActive: true,
    plannedSessions,
    entries: entries.map(toScoringEntry),
    attendance: attendance.map((a) => ({ attendedOn: a.attended_on, voided: a.voided_at !== null })),
  };
}

/**
 * The member card for the season covering `today` (or, between seasons, a card without
 * points). In a preseason no points exist (SCORING §6): baselines are being built.
 */
export function buildMemberCard(params: {
  season: CardSeason | null;
  history: ParticipantHistory;
  entries: readonly EntryRecord[];
  today: IsoDate;
  viewerId: string;
}): MemberCard {
  const { season, history, entries, today, viewerId } = params;
  const todayRows = entries
    .filter((e) => e.performed_on === today)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const loggedToday = new Set(todayRows.filter((e) => !e.voided_at).map((e) => e.category));
  const attendedToday = history.attendance.some((a) => !a.voided && a.attendedOn === today);
  const todayEntries: TodayEntry[] = todayRows.map((e) => ({
    id: e.id,
    category: e.category,
    value: formatValue(e.category, entryValue(toScoringEntry(e))),
    weight_kg: e.weight_kg,
    reps: e.reps,
    km: e.km,
    created_at: e.created_at,
    has_photo: e.photo_path !== null,
    voided: e.voided_at !== null,
    can_undo: e.voided_at === null && e.logged_by === viewerId && e.performed_on === today,
  }));

  if (!season) {
    return {
      season: null, is_rookie: false, total: 0, total_display: 0, rank: null, rank_of: null,
      planned_sessions: history.plannedSessions, attended: 0, attended_today: attendedToday,
      consistency: { points: 0, points_display: 0, max: CATEGORY_MAX.consistency },
      categories: CATEGORY_CODES.map((code) => ({
        code, baseline: null, month_best: null, points: 0, points_display: 0, max: CATEGORY_MAX[code],
        logged_today: loggedToday.has(code), has_baseline: false, at_cap: false,
      })),
      today_entries: todayEntries,
    };
  }

  const window = toWindow(season);
  const values = memberSeasonValues(history, window);
  const score = scoreMember(values);
  const preseason = season.type === "preseason";
  const pts = (r: Rational) => (preseason ? 0 : num(r));
  const shown = (r: Rational) => (preseason ? 0 : r.roundHalfUp());

  const categories: CategoryTile[] = CATEGORY_CODES.map((code) => {
    if (isTestCategory(code)) {
      const b = values.baseline[code] ?? null;
      const m = values.monthBest[code] ?? null;
      return {
        code,
        baseline: b ? formatValue(code, b) : null,
        month_best: m ? formatValue(code, m) : null,
        points: pts(score.categories[code]),
        points_display: shown(score.categories[code]),
        max: CATEGORY_MAX[code],
        logged_today: loggedToday.has(code),
        has_baseline: b !== null && !values.isRookie,
        at_cap: !preseason && !values.isRookie && isTestCategoryAtCap(code, b, m),
      };
    }
    const credited = treadmillCreditedKm(values.treadmillKmByDay);
    return {
      code,
      baseline: null,
      month_best: credited.isZero() ? null : credited.toFixed(1),
      points: pts(score.categories.treadmill),
      points_display: shown(score.categories.treadmill),
      max: CATEGORY_MAX.treadmill,
      logged_today: loggedToday.has(code),
      has_baseline: false, // the treadmill is not scored against a baseline (SCORING §3)
      at_cap: !preseason && !credited.lt(TREADMILL_SEASON_CAP_KM),
    };
  });

  const total = preseason ? Rational.ZERO : score.total;
  return {
    season,
    is_rookie: values.isRookie,
    total: num(total),
    total_display: total.roundHalfUp(),
    rank: null,
    rank_of: null,
    planned_sessions: values.plannedSessions,
    attended: values.attendedDays,
    attended_today: attendedToday,
    consistency: { points: pts(score.categories.consistency), points_display: shown(score.categories.consistency), max: CATEGORY_MAX.consistency },
    categories,
    today_entries: todayEntries,
  };
}

export interface PreviewPayload {
  value: string;
  is_new_best: boolean;
  points_before: number;
  points_after: number;
  points_delta: number;
  /** delta rounded half-up — the "+72 pts" the coach sees */
  points_delta_display: number;
  total_after: number;
  total_after_display: number;
  photo_required: boolean;
}

/** UX C4 live preview — exactly what saving would do (scoring `previewEntry`, SCORING §6). */
export function buildPreview(params: {
  season: CardSeason;
  history: ParticipantHistory;
  entry: EntryInput;
  date: IsoDate;
}): { ok: true; preview: PreviewPayload } | { ok: false; errors: EntryValidationError[] } {
  const result = previewEntry({ season: toWindow(params.season), participant: params.history, entry: params.entry, today: params.date });
  if (!result.ok) return result;
  const p = result.preview;
  return {
    ok: true,
    preview: {
      value: formatValue(params.entry.category, p.value),
      is_new_best: p.isNewBest,
      points_before: num(p.categoryPointsBefore),
      points_after: num(p.categoryPointsAfter),
      points_delta: num(p.pointsDelta),
      points_delta_display: p.pointsDelta.roundHalfUp(),
      total_after: num(p.totalAfter),
      total_after_display: p.totalAfter.roundHalfUp(),
      photo_required: p.photoRequired,
    },
  };
}

/**
 * BR-E6 on the server: is a photo required for this entry? Same function the preview uses
 * (SCORING §6), evaluated on the member's history as stored right now.
 */
export function photoRequiredFor(season: CardSeason, history: ParticipantHistory, entry: EntryInput): boolean {
  const values = memberSeasonValues(history, toWindow(season));
  return isPhotoRequired(toWindow(season), values, entry.category, entryValue(entry));
}
