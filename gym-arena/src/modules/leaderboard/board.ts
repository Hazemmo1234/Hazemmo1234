/**
 * Leaderboard shaping (M4). Pure: the points and ranks come from modules/scoring
 * (scoreSeason → SCORING §5 ranking with full precision and shared ranks, rookies on their own
 * list, inactive members unranked — BR-R2, BR-P5, D29). Nothing here scores or re-ranks.
 *
 * Output is an explicit allow-list (API_SPECIFICATION "Leaderboard"; never phones, member
 * codes, raw results or evidence — BR-X2 spirit). A coach receives another coach's members
 * WITHOUT member_id and WITHOUT photo_url (a signed avatar URL carries the member id in its
 * storage path): the id is only useful to open a client the caller may see.
 */
import {
  CATEGORY_CODES,
  Rational,
  SCORE_CATEGORIES,
  TEST_CATEGORIES,
  entryValue,
  scoreSeason,
  type CategoryCode,
  type IsoDate,
  type MemberScore,
  type ParticipantHistory,
  type RankedRow,
  type ScoreCategory,
  type SeasonType,
} from "@/modules/scoring";

export interface BoardSeason {
  id: string;
  name: string;
  type: SeasonType;
  starts_on: IsoDate;
  ends_on: IsoDate;
}

export interface BoardMember {
  id: string;
  full_name: string;
  coach_id: string;
  coach_name: string | null;
  is_active: boolean;
  /** signed URL, only when the member consented to show their photo (BR-P8) */
  photo_url: string | null;
}

export interface LeaderboardRow {
  rank: number;
  /** null for another coach's member (a coach cannot open them anyway) */
  member_id: string | null;
  /** the caller's own client (coach) — highlighted (UX C6) */
  own: boolean;
  full_name: string;
  photo_url: string | null;
  coach_name: string | null;
  is_rookie: boolean;
  /** exact value rounded to 2 decimals, and the half-up integer the UI shows (SCORING §5) */
  total: number;
  total_display: number;
  improvement_points: number;
  categories: Record<ScoreCategory, number>;
}

export interface Leaderboard {
  season: BoardSeason;
  /**
   * true = the FROZEN final results of a closed season (season_results, written once by the
   * close operation — D21, D29); false = the live ranking of an open season. A closed season
   * is never recomputed: later edits or member-status changes cannot alter its standings.
   */
  final: boolean;
  main: LeaderboardRow[];
  rookies: LeaderboardRow[];
}

export interface Viewer {
  id: string;
  role: "admin" | "coach";
}

/** Where one member stands (Members list, Today, member card). */
export interface Standing {
  rank: number;
  /** size of the list the member is ranked in (main board or rookies) */
  of: number;
  list: "main" | "rookies";
  total: number;
  total_display: number;
}

const num = (r: Rational) => Number(r.toFixed(2));

function toRow(r: RankedRow, member: BoardMember, viewer: Viewer): LeaderboardRow {
  const own = viewer.role === "coach" && member.coach_id === viewer.id;
  const identifiable = viewer.role === "admin" || own;
  const categories = {} as Record<ScoreCategory, number>;
  for (const c of SCORE_CATEGORIES) categories[c] = num(r.categories[c]);
  return {
    rank: r.rank,
    member_id: identifiable ? member.id : null,
    own,
    full_name: member.full_name,
    // D31: a signed avatar URL embeds the storage path members/<member_id>/…, so it would reveal
    // the id masked above: photos only where the id may be shown (admin, own clients)
    photo_url: identifiable ? member.photo_url : null,
    coach_name: member.coach_name,
    is_rookie: r.isRookie,
    total: num(r.total),
    total_display: r.total.roundHalfUp(),
    improvement_points: num(r.improvementPoints),
    categories,
  };
}

/** The ranked season — one scoreSeason call for everyone (AC-20: same numbers everywhere). */
export function rankParticipants(season: BoardSeason, participants: readonly ParticipantHistory[]) {
  return scoreSeason({ type: season.type, startsOn: season.starts_on, endsOn: season.ends_on }, participants);
}

export function buildLeaderboard(
  season: BoardSeason,
  standings: ReturnType<typeof rankParticipants>,
  members: ReadonlyMap<string, BoardMember>,
  viewer: Viewer,
): Leaderboard {
  const rows = (list: readonly RankedRow[]) =>
    list.flatMap((r) => {
      const m = members.get(r.memberId);
      // BR-P5 / AC-53: a live board never shows an inactive member (scoreSeason already
      // leaves them unranked; this is the second, explicit guard)
      return m && m.is_active ? [toRow(r, m, viewer)] : [];
    });
  return { season, final: false, main: rows(standings.main), rookies: rows(standings.rookies) };
}

/** One season_results row as stored at close (numeric columns as text, read exactly). */
export interface FrozenResultRow {
  member_id: string;
  is_rookie: boolean;
  deadlift: string;
  bench: string;
  squat: string;
  pullups: string;
  pushups: string;
  treadmill: string;
  consistency: string;
  improvement_points: string;
  total: string;
  /** null for rookies and for members inactive at close (D29) */
  rank: number | null;
  /** null for non-rookies and for members inactive at close (D29) */
  rookie_rank: number | null;
  member_active: boolean;
}

/**
 * The board of a CLOSED season, straight from the frozen results: ranks, rookie ranks and
 * points exactly as stored at close. Nothing is re-scored or re-ranked, and the member's
 * CURRENT status is deliberately not consulted — whoever was ranked at close stays ranked;
 * members inactive at close were stored unranked and are not shown (BR-P5, D29). Names,
 * coach names and photos are display data and follow the same privacy rules as the live
 * board (member_id and photo only for the admin and the coach's own clients).
 */
export function buildFrozenLeaderboard(
  season: BoardSeason,
  results: readonly FrozenResultRow[],
  members: ReadonlyMap<string, BoardMember>,
  viewer: Viewer,
): Leaderboard {
  const byRank = (rankOf: (r: FrozenResultRow) => number | null) =>
    results
      .filter((r) => rankOf(r) !== null && members.has(r.member_id))
      .map((r) => ({ r, m: members.get(r.member_id)!, rank: rankOf(r)! }))
      // within a shared rank: a stable, presentation-only order
      .sort((a, b) => a.rank - b.rank || a.m.full_name.localeCompare(b.m.full_name) || (a.r.member_id < b.r.member_id ? -1 : 1))
      .map(({ r, m, rank }) => frozenRow(r, rank, m, viewer));
  return { season, final: true, main: byRank((r) => r.rank), rookies: byRank((r) => r.rookie_rank) };
}

function frozenRow(r: FrozenResultRow, rank: number, member: BoardMember, viewer: Viewer): LeaderboardRow {
  const own = viewer.role === "coach" && member.coach_id === viewer.id;
  const identifiable = viewer.role === "admin" || own;
  const total = Rational.from(r.total);
  const categories = {} as Record<ScoreCategory, number>;
  for (const c of SCORE_CATEGORIES) categories[c] = num(Rational.from(r[c]));
  return {
    rank,
    member_id: identifiable ? member.id : null,
    own,
    full_name: member.full_name,
    photo_url: identifiable ? member.photo_url : null,
    coach_name: member.coach_name,
    is_rookie: r.is_rookie,
    total: num(total),
    total_display: total.roundHalfUp(),
    improvement_points: num(Rational.from(r.improvement_points)),
    categories,
  };
}

export function standingsByMember(standings: ReturnType<typeof rankParticipants>): Map<string, Standing> {
  const out = new Map<string, Standing>();
  for (const [list, rows] of [["main", standings.main], ["rookies", standings.rookies]] as const) {
    for (const r of rows) out.set(r.memberId, { rank: r.rank, of: rows.length, list, total: num(r.total), total_display: r.total.roundHalfUp() });
  }
  return out;
}

/**
 * "New bests this season" (UX A1), with the M1 definition of a new best (scoring README):
 * a value above the member's previous highest recorded value in that category, baseline
 * included; a first-ever value is not one; voided entries do not count; treadmill never.
 * Each participant's entries = their best pre-season entry per category (enough: only the
 * maximum matters before the season) plus every in-season entry.
 */
export function countNewBests(participants: readonly ParticipantHistory[], seasonStart: IsoDate): number {
  let count = 0;
  for (const p of participants) {
    for (const category of TEST_CATEGORIES) {
      // one non-voided entry per member, category and day (BR-E2, entries_one_per_day), so
      // ordering by day is a total order within a member's category
      const own = p.entries.filter((e) => e.category === category && !e.voided).sort((a, b) => (a.performedOn < b.performedOn ? -1 : 1));
      let best: Rational | null = null;
      for (const e of own) {
        const v = entryValue(e);
        if (e.performedOn >= seasonStart && best && v.gt(best)) count++;
        best = best ? best.max(v) : v;
      }
    }
  }
  return count;
}

export interface SeasonActivity {
  /** non-voided in-season entries per category (UX A1 bar) */
  entriesPerCategory: Record<CategoryCode, number>;
  /**
   * Active participants with ≥ 1 non-voided in-season entry in the LAST 7 CAIRO CALENDAR DAYS,
   * today included (windowStart = today − 6 … today). D32 (owner decision K3): UX A1 says "this
   * week"; this rolling window is the agreed definition and the UI labels it "last 7 days".
   */
  activeLast7Days: number;
  activeParticipants: number;
}

export function seasonActivity(
  participants: readonly ParticipantHistory[],
  seasonStart: IsoDate,
  windowStart: IsoDate,
  today: IsoDate,
): SeasonActivity {
  const entriesPerCategory = Object.fromEntries(CATEGORY_CODES.map((c) => [c, 0])) as Record<CategoryCode, number>;
  let activeLast7Days = 0;
  let activeParticipants = 0;
  for (const p of participants) {
    const inSeason = p.entries.filter((e) => !e.voided && e.performedOn >= seasonStart);
    for (const e of inSeason) entriesPerCategory[e.category]++;
    if (!p.isActive) continue;
    activeParticipants++;
    if (inSeason.some((e) => e.performedOn >= windowStart && e.performedOn <= today)) activeLast7Days++;
  }
  return { entriesPerCategory, activeLast7Days, activeParticipants };
}

/** First `n` rows of the main board, plus how many more rows share the last shown rank (D10). */
export function topOf(board: Leaderboard, n: number): { rows: LeaderboardRow[]; moreTied: number } {
  const rows = board.main.slice(0, n);
  const last = rows.at(-1);
  const moreTied = last ? board.main.slice(n).filter((r) => r.rank === last.rank).length : 0;
  return { rows, moreTied };
}

export type { MemberScore };
