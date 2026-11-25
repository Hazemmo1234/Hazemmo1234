/**
 * TV state shaping (API_SPECIFICATION "TV", UX section C). Pure: no I/O, no clock — the
 * caller passes `today` (Cairo, lib/time.ts) and `now`. Points and ranks come from
 * modules/scoring (live) or from the frozen season_results (reveal); nothing here scores or
 * re-ranks (D14, AC-20).
 *
 * Allow-list output (BR-X2, AC-26): rank, full name, photo URL (consent only), points,
 * category points, rank movement, rookie list, recent new-best events. Never a phone,
 * member code, member id, coach, evidence or raw result. Rows carry `ref`, an opaque
 * per-TV-key token (HMAC of the member id, made by the caller) so the screen can animate a
 * row across polls without learning who it is.
 */
import { CATEGORY_LABEL } from "@/lib/categories";
import { initials } from "@/lib/initials";
import {
  Rational,
  SCORE_CATEGORIES,
  TEST_CATEGORIES,
  entryValue,
  type CategoryCode,
  type IsoDate,
  type ParticipantHistory,
  type RankedRow,
  type ScoreCategory,
  type ScoringEntry,
  type SeasonStandings,
} from "@/modules/scoring";
import { nextScheduledSeason, seasonDaysLeft, seasonStatus, type SeasonType } from "@/modules/seasons/status";

export type TvMode = "live" | "preseason" | "between" | "reveal";
/** Why the TV is between seasons (UX C "Between"). */
export type BetweenReason = "awaiting_close" | "awaiting_reveal" | "off_season";

export interface TvSeasonRow {
  id: string;
  name: string;
  type: SeasonType;
  starts_on: IsoDate;
  ends_on: IsoDate;
  closed_at: string | null;
  reveal_started_at: string | null;
}

export interface TvModeDecision {
  mode: TvMode;
  /** the season the screen is about (null: no season has ever started) */
  season: TvSeasonRow | null;
  between: BetweenReason | null;
  /** the next season that has not started yet (countdowns) */
  next: TvSeasonRow | null;
}

/**
 * Which screen the TV shows (UX C "Modes"):
 * - an active championship → live; an active preseason → preseason;
 * - otherwise the most recent season that has started decides:
 *   ended, not closed → between ("results coming soon" — the provisional ranking of an ended
 *   season is NOT shown: it is not final and would spoil the reveal);
 *   closed championship with the reveal started → reveal (the sequence, then the final podium
 *   held until the next season starts); closed championship without reveal → between;
 *   closed preseason or nothing → between (countdown to the next season, if any).
 */
export function resolveTvMode(seasons: readonly TvSeasonRow[], today: IsoDate): TvModeDecision {
  const next = nextScheduledSeason(seasons, today);
  const active = seasons.find((s) => seasonStatus(s, today) === "active");
  if (active) return { mode: active.type === "preseason" ? "preseason" : "live", season: active, between: null, next };
  const latest = [...seasons]
    .filter((s) => seasonStatus(s, today) !== "scheduled")
    .sort((a, b) => (a.ends_on < b.ends_on ? 1 : a.ends_on > b.ends_on ? -1 : 0))[0];
  if (!latest) return { mode: "between", season: null, between: "off_season", next };
  if (!latest.closed_at) return { mode: "between", season: latest, between: "awaiting_close", next };
  if (latest.type === "preseason") return { mode: "between", season: latest, between: "off_season", next };
  if (latest.reveal_started_at) return { mode: "reveal", season: latest, between: null, next };
  return { mode: "between", season: latest, between: "awaiting_reveal", next };
}

/** A member as the TV may know them. */
export interface TvMember {
  full_name: string;
  is_active: boolean;
  /** signed URL, only if the member consented (BR-P8); null otherwise */
  photo_url: string | null;
}

export type RefOf = (memberId: string) => string;

/**
 * D34 (owner decision, 2026-11-25): when two members the TV may show have the same full name, each
 * of them carries a second identifier so the gym can tell them apart: the coach's name when it
 * differs between them, otherwise a short, stable member number ("#127", from the member code).
 * Everyone else carries no tag. Display only — never part of ranking or scoring.
 */
export interface TvTag {
  kind: "coach" | "member";
  text: string;
}

/** What the tag rule needs to know about a member. */
export interface TagSource {
  full_name: string;
  coach_name: string | null;
  member_code: string | null;
}

/** Names compare equal when they read the same: Unicode-normalised, spaces collapsed, case-folded. */
export function sameNameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

/** "GA-000127" → "#127". Null when there is no number to show. */
export function shortMemberNumber(code: string | null | undefined): string | null {
  const m = code?.match(/(\d+)$/);
  return m ? `#${Number(m[1])}` : null;
}

/**
 * The D34 tags for a set of people who can appear together on the TV. Only members whose name is
 * shared get a tag. Within a group of identical names, a coach name that only one of them has
 * identifies that member; members whose coach name is shared within the group, or missing, get
 * their short member number (or `fallback(id)` if a code were ever missing).
 */
export function duplicateNameTags(people: ReadonlyMap<string, TagSource>, fallback: (id: string) => string): Map<string, TvTag> {
  const groups = new Map<string, string[]>();
  for (const [id, p] of people) {
    const key = sameNameKey(p.full_name);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  const tags = new Map<string, TvTag>();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const coachCount = new Map<string, number>();
    for (const id of ids) {
      const coach = people.get(id)!.coach_name?.trim();
      if (coach) coachCount.set(sameNameKey(coach), (coachCount.get(sameNameKey(coach)) ?? 0) + 1);
    }
    for (const id of ids) {
      const p = people.get(id)!;
      const coach = p.coach_name?.trim();
      if (coach && coachCount.get(sameNameKey(coach)) === 1) tags.set(id, { kind: "coach", text: coach });
      else tags.set(id, { kind: "member", text: shortMemberNumber(p.member_code) ?? fallback(id) });
    }
  }
  return tags;
}

export interface TvBoardRow {
  ref: string;
  rank: number;
  name: string;
  /** D34: second identifier, only when another member the TV may show has the same name */
  tag: TvTag | null;
  photo_url: string | null;
  initials: string;
  /** integer, half-up (SCORING §5) */
  total: number;
  /** places gained since the start of the Cairo day (+ up, − down); null = no comparison (D9) */
  movement: number | null;
  /** points behind the row above (0 for rank 1 and for shared ranks) */
  gap_to_next: number;
  categories: Record<ScoreCategory, number>;
  /** time of the member's latest new best today (ISO) — the TV shows "PR" for 60 s after it */
  pr_at: string | null;
}

export interface TvRookieRow {
  ref: string;
  rank: number;
  name: string;
  /** D34: second identifier, only when another member the TV may show has the same name */
  tag: TvTag | null;
  photo_url: string | null;
  initials: string;
  total: number;
}

export interface TvRecentBest {
  ref: string;
  name: string;
  /** D34: second identifier, only when another member the TV may show has the same name */
  tag: TvTag | null;
  category: CategoryCode;
  /** category name + numbers only, so it reads the same in both languages (API spec) */
  text: string;
  at: string;
}

export interface TvRecentBaseline {
  ref: string;
  name: string;
  /** D34: second identifier, only when another member the TV may show has the same name */
  tag: TvTag | null;
  category: CategoryCode;
  at: string;
}

export interface TvWinner {
  ref: string;
  place: number;
  name: string;
  /** D34: second identifier, only when another member the TV may show has the same name */
  tag: TvTag | null;
  photo_url: string | null;
  initials: string;
  total: number;
}

export interface TvState {
  version: string;
  server_time: string;
  locale: "ar" | "en";
  gym_name: string | null;
  mode: TvMode;
  season: { name: string; type: SeasonType; starts_on: IsoDate; ends_on: IsoDate; days_left: number } | null;
  next_season_starts_on: IsoDate | null;
  /** days until the next season starts (countdowns); null when none is scheduled */
  next_season_in_days: number | null;
  between: { reason: BetweenReason } | null;
  board: TvBoardRow[];
  rookies: TvRookieRow[];
  recent_bests: TvRecentBest[];
  preseason: { baselines_logged: number; participants: number; recent: TvRecentBaseline[] } | null;
  reveal: { started_at: string; winners: TvWinner[] } | null;
}

/** One stored snapshot row: the rank and exact total at the start of a Cairo day. */
export interface SnapshotRow {
  member_id: string;
  rank: number;
  total: string;
}

/** A recorded entry with its creation time (from the season loader's raw records). */
export interface TimedEntry {
  member_id: string;
  category: CategoryCode;
  performed_on: IsoDate;
  weight_kg: string | null;
  reps: number | null;
  km: string | null;
  created_at: string;
}

export const ROOKIES_ON_TV = 5;
export const RECENT_EVENTS = 15;

const int = (r: Rational) => r.roundHalfUp();

/**
 * The standings at the START of `day`: the same participants scored with only what was dated
 * before that day (entries performed and attendance attended before it). This is what the daily
 * snapshot stores (DATABASE_SCHEMA daily_rank_snapshots, D9) — computed from recorded data, so
 * it is the same whenever the snapshot job happens to run that day.
 */
export function historyBefore(p: ParticipantHistory, day: IsoDate): ParticipantHistory {
  return {
    ...p,
    entries: p.entries.filter((e) => e.performedOn < day),
    attendance: p.attendance.filter((a) => a.attendedOn < day),
  };
}

/**
 * D9 / AC-30: movement = start-of-day rank − current rank (positive = moved up). No arrow is
 * invented: a member with no snapshot row (no snapshot today, new participant) or with no points
 * at the start of the day (everyone shares rank 1 at 0 points on day one) gets null.
 */
export function movementOf(memberId: string, currentRank: number, snapshot: ReadonlyMap<string, SnapshotRow> | null): number | null {
  const before = snapshot?.get(memberId);
  if (!before) return null;
  if (Rational.from(before.total).isZero()) return null;
  return before.rank - currentRank;
}

/**
 * New bests of the season, newest first (M1 definition, same as the dashboard count): a test
 * category value above the member's previous highest value, baseline included. A first-ever
 * value is not a new best; treadmill never is. Only active members (BR-P5).
 */
export function seasonNewBests(
  records: ReadonlyMap<string, readonly TimedEntry[]>,
  seasonStart: IsoDate,
  isShown: (memberId: string) => boolean,
): Array<{ member_id: string; category: CategoryCode; previous: Rational; value: Rational; at: string; performed_on: IsoDate }> {
  const out: Array<{ member_id: string; category: CategoryCode; previous: Rational; value: Rational; at: string; performed_on: IsoDate }> = [];
  for (const [memberId, list] of records) {
    if (!isShown(memberId)) continue;
    for (const category of TEST_CATEGORIES) {
      const own = list.filter((e) => e.category === category).sort((a, b) => (a.performed_on < b.performed_on ? -1 : a.performed_on > b.performed_on ? 1 : 0));
      let best: Rational | null = null;
      for (const e of own) {
        const v = entryValue(toScoring(e));
        if (e.performed_on >= seasonStart && best && v.gt(best)) {
          out.push({ member_id: memberId, category, previous: best, value: v, at: e.created_at, performed_on: e.performed_on });
        }
        best = best ? best.max(v) : v;
      }
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

function toScoring(e: TimedEntry): ScoringEntry {
  return { category: e.category, performedOn: e.performed_on, weightKg: e.weight_kg, reps: e.reps, km: e.km };
}

/** "Deadlift +12.4%" — or "Pull-ups 0 → 5" when the previous best was zero. */
export function newBestText(category: CategoryCode, previous: Rational, value: Rational): string {
  const label = CATEGORY_LABEL[category];
  if (previous.isZero()) return `${label} 0 → ${value.toFixed(category === "pullups" || category === "pushups" ? 0 : 1)}`;
  const pct = value.sub(previous).div(previous).mul(Rational.int(100));
  return `${label} +${pct.toFixed(1)}%`;
}

function categoriesOf(r: RankedRow): Record<ScoreCategory, number> {
  const out = {} as Record<ScoreCategory, number>;
  for (const c of SCORE_CATEGORIES) out[c] = int(r.categories[c]);
  return out;
}

export interface LiveInputs {
  standings: SeasonStandings;
  members: ReadonlyMap<string, TvMember>;
  records: ReadonlyMap<string, readonly TimedEntry[]>;
  seasonStart: IsoDate;
  today: IsoDate;
  snapshot: ReadonlyMap<string, SnapshotRow> | null;
  refOf: RefOf;
  /** D34 tags by member id (duplicateNameTags); absent = no tag */
  tags?: ReadonlyMap<string, TvTag>;
}

/** Live mode: the whole main board, the top rookies and the recent new bests. */
export function liveContent(input: LiveInputs): Pick<TvState, "board" | "rookies" | "recent_bests"> {
  const { standings, members, refOf } = input;
  const tagOf = (id: string) => input.tags?.get(id) ?? null;
  const shown = (id: string) => members.get(id)?.is_active === true;
  const bests = seasonNewBests(input.records, input.seasonStart, shown);
  const prAt = new Map<string, string>();
  for (const b of bests) if (b.performed_on === input.today && !prAt.has(b.member_id)) prAt.set(b.member_id, b.at);

  // BR-P5: inactive members are never on a TV (scoreSeason leaves them unranked; second guard here)
  const main = standings.main.filter((r) => shown(r.memberId));
  const board: TvBoardRow[] = main.map((r, i) => {
    const m = members.get(r.memberId)!;
    const above = i > 0 ? main[i - 1]! : null;
    return {
      ref: refOf(r.memberId),
      rank: r.rank,
      name: m.full_name,
      tag: tagOf(r.memberId),
      photo_url: m.photo_url,
      initials: initials(m.full_name),
      total: int(r.total),
      movement: movementOf(r.memberId, r.rank, input.snapshot),
      gap_to_next: above && above.rank !== r.rank ? Math.max(0, int(above.total) - int(r.total)) : 0,
      categories: categoriesOf(r),
      pr_at: prAt.get(r.memberId) ?? null,
    };
  });
  const rookies: TvRookieRow[] = standings.rookies
    .filter((r) => shown(r.memberId))
    .slice(0, ROOKIES_ON_TV)
    .map((r) => {
      const m = members.get(r.memberId)!;
      return { ref: refOf(r.memberId), rank: r.rank, name: m.full_name, tag: tagOf(r.memberId), photo_url: m.photo_url, initials: initials(m.full_name), total: int(r.total) };
    });
  const recent_bests: TvRecentBest[] = bests.slice(0, RECENT_EVENTS).map((b) => ({
    ref: refOf(b.member_id),
    name: members.get(b.member_id)!.full_name,
    tag: tagOf(b.member_id),
    category: b.category,
    text: newBestText(b.category, b.previous, b.value),
    at: b.at,
  }));
  return { board, rookies, recent_bests };
}

/**
 * Preseason mode: how many active participants have logged at least one baseline, and the
 * latest baseline entries (who, which category — no numbers: baselines are not a contest).
 */
export function preseasonContent(
  participants: readonly ParticipantHistory[],
  members: ReadonlyMap<string, TvMember>,
  records: ReadonlyMap<string, readonly TimedEntry[]>,
  seasonStart: IsoDate,
  refOf: RefOf,
  tags?: ReadonlyMap<string, TvTag>,
): NonNullable<TvState["preseason"]> {
  const active = participants.filter((p) => members.get(p.memberId)?.is_active);
  const logged = active.filter((p) => p.entries.some((e) => !e.voided && e.performedOn >= seasonStart)).length;
  const recent: TvRecentBaseline[] = active
    .flatMap((p) => (records.get(p.memberId) ?? []).filter((e) => e.performed_on >= seasonStart && e.created_at).map((e) => ({ p, e })))
    .sort((a, b) => (a.e.created_at < b.e.created_at ? 1 : a.e.created_at > b.e.created_at ? -1 : 0))
    .slice(0, RECENT_EVENTS)
    .map(({ p, e }) => ({ ref: refOf(p.memberId), name: members.get(p.memberId)!.full_name, tag: tags?.get(p.memberId) ?? null, category: e.category, at: e.created_at }));
  return { baselines_logged: logged, participants: active.length, recent };
}

/** A frozen result row as needed for the reveal (season_results: rank, total). */
export interface FrozenPodiumRow {
  member_id: string;
  rank: number | null;
  total: string;
}

/**
 * The reveal podium: the frozen ranks 1–3 of the main board exactly as stored at close (BR-W1,
 * D10: shared ranks → every tied member is a winner). Members inactive at close were stored
 * unranked (D29) and can never appear. Never recomputed from current entries.
 */
export function revealWinners(rows: readonly FrozenPodiumRow[], members: ReadonlyMap<string, Omit<TvMember, "is_active">>, refOf: RefOf, tags?: ReadonlyMap<string, TvTag>): TvWinner[] {
  return rows
    .filter((r) => r.rank !== null && r.rank <= 3 && members.has(r.member_id))
    .map((r) => ({ r, m: members.get(r.member_id)! }))
    .sort((a, b) => a.r.rank! - b.r.rank! || a.m.full_name.localeCompare(b.m.full_name))
    .map(({ r, m }) => ({
      ref: refOf(r.member_id),
      place: r.rank!,
      name: m.full_name,
      tag: tags?.get(r.member_id) ?? null,
      photo_url: m.photo_url,
      initials: initials(m.full_name),
      total: Rational.from(r.total).roundHalfUp(),
    }));
}

/** The season summary every mode shows in its top bar. */
export function seasonSummary(season: TvSeasonRow | null, today: IsoDate): TvState["season"] {
  if (!season) return null;
  const status = seasonStatus(season, today);
  return {
    name: season.name,
    type: season.type,
    starts_on: season.starts_on,
    ends_on: season.ends_on,
    days_left: status === "active" ? seasonDaysLeft(season, today) : 0,
  };
}

/**
 * Everything that changes what the screen shows, without the volatile parts (server time,
 * signed photo URLs that are re-issued) — hashed by the caller into `version` so the TV
 * animates only when the content really changed (UX C "Behaviors").
 */
export function versionMaterial(state: Omit<TvState, "version" | "server_time">): string {
  const photos = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(photos) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "photo_url" ? v !== null : photos(v)])) : x;
  return JSON.stringify(photos(state));
}
