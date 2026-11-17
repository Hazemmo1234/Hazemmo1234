import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErrorCode } from "@/lib/api";
import { chunk, fetchAll } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";
import type { CategoryCode } from "@/lib/supabase/types";
import { participantHistory, type AttendanceRecordRow, type EntryRecord } from "@/modules/entries/card";
import type { IsoDate, ParticipantHistory } from "@/modules/scoring";
import { activeSeason } from "@/modules/seasons/status";
import {
  buildFrozenLeaderboard,
  buildLeaderboard,
  countNewBests,
  rankParticipants,
  seasonActivity,
  standingsByMember,
  type BoardMember,
  type BoardSeason,
  type FrozenResultRow,
  type Leaderboard,
  type SeasonActivity,
  type Standing,
  type Viewer,
} from "./board";

/**
 * M4 leaderboard data path.
 *
 * A coach must see the GLOBAL ranking although row security (correctly) hides other coaches'
 * clients from them. So:
 * 1. the caller is an authenticated, ACTIVE staff member (route: requireStaff) and the season
 *    is read with the caller's OWN client first — it must be visible to them under RLS;
 * 2. only then does the server read the season's inputs with the service role (server-only
 *    module; the key never reaches a browser), via paged reads and the service_role-only
 *    function leaderboard_baselines (migration 20261116000004);
 * 3. the M1 scoring module computes every point and rank (D14, AC-20);
 * 4. the response is an explicit allow-list (board.ts): no phones, member codes, raw results,
 *    attendance details or evidence; another coach's members come without member_id and
 *    without photo (the signed URL's path contains the member id); photos only with consent,
 *    as short-lived signed URLs (BR-P8).
 */
export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string };

const AVATARS = "avatars";
const PHOTO_URL_SECONDS = 3600;

interface SeasonRow extends BoardSeason {
  closed_at: string | null;
}

export interface SeasonInputs {
  season: BoardSeason;
  participants: ParticipantHistory[];
  members: Map<string, BoardMember & { photo_path: string | null; photo_consent: boolean }>;
}

/** Everything the scoring module needs for a whole season — read in full, never truncated. */
export async function loadSeasonInputs(season: BoardSeason): Promise<SeasonInputs> {
  const service = createServiceClient();
  type ParticipantRow = { member_id: string; planned_sessions: number; members: { full_name: string; coach_id: string; status: string; photo_path: string | null; photo_consent: boolean } | null };
  const [rows, baselines, entries, attendance] = await Promise.all([
    fetchAll<ParticipantRow>((from, to) =>
      service.from("season_participants").select("member_id, planned_sessions, members(full_name, coach_id, status, photo_path, photo_consent)")
        .eq("season_id", season.id).order("member_id").range(from, to) as never),
    fetchAll<{ member_id: string; category: CategoryCode; performed_on: string; weight_kg: string | null; reps: number | null; km: string | null }>((from, to) =>
      service.rpc("leaderboard_baselines", { p_season_id: season.id }).order("member_id").order("category").range(from, to) as never),
    fetchAll<EntryRecord>((from, to) =>
      service.from("entries").select("id, member_id, category, performed_on, weight_kg::text, reps, km::text, photo_path, logged_by, created_at, voided_at")
        .eq("season_id", season.id).is("voided_at", null).order("id").range(from, to) as never),
    fetchAll<AttendanceRecordRow>((from, to) =>
      service.from("attendance").select("member_id, attended_on, voided_at")
        .eq("season_id", season.id).is("voided_at", null).order("id").range(from, to) as never),
  ]);

  const coachNames = await coachNamesOf(rows.map((r) => r.members?.coach_id).filter((x): x is string => !!x));

  const byMember = new Map<string, EntryRecord[]>();
  const push = (e: EntryRecord) => byMember.set(e.member_id, [...(byMember.get(e.member_id) ?? []), e]);
  for (const b of baselines) push({ id: "", member_id: b.member_id, category: b.category, performed_on: b.performed_on, weight_kg: b.weight_kg, reps: b.reps, km: b.km, photo_path: null, logged_by: "", created_at: "", voided_at: null });
  for (const e of entries) push(e);
  const attByMember = new Map<string, AttendanceRecordRow[]>();
  for (const a of attendance) attByMember.set(a.member_id, [...(attByMember.get(a.member_id) ?? []), a]);

  const members: SeasonInputs["members"] = new Map();
  const participants: ParticipantHistory[] = [];
  for (const r of rows) {
    if (!r.members) continue;
    members.set(r.member_id, {
      id: r.member_id,
      full_name: r.members.full_name,
      coach_id: r.members.coach_id,
      coach_name: coachNames.get(r.members.coach_id) ?? null,
      is_active: r.members.status === "active",
      photo_url: null,
      photo_path: r.members.photo_path,
      photo_consent: r.members.photo_consent,
    });
    participants.push({
      ...participantHistory(r.member_id, r.planned_sessions, byMember.get(r.member_id) ?? [], attByMember.get(r.member_id) ?? []),
      isActive: r.members.status === "active",
    });
  }
  return { season, participants, members };
}

/** Photos for the rows being returned: consented members only (BR-P8), short-lived URLs. */
async function signPhotos(members: SeasonInputs["members"], ids: readonly string[]) {
  const paths = ids.map((id) => members.get(id)).filter((m) => m && m.photo_consent && m.photo_path).map((m) => m!.photo_path!);
  if (paths.length === 0) return;
  const urls = new Map<string, string>();
  for (const part of chunk(paths, 500)) {
    const { data } = await createServiceClient().storage.from(AVATARS).createSignedUrls(part, PHOTO_URL_SECONDS);
    for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  for (const m of members.values()) if (m.photo_consent && m.photo_path) m.photo_url = urls.get(m.photo_path) ?? null;
}

async function seasonFor(client: SupabaseClient, seasonId: string | undefined, today: IsoDate): Promise<Result<SeasonRow | null>> {
  // Read with the CALLER's client: the season must be visible to them under RLS.
  const { data, error } = await client.from("seasons").select("id, name, type, starts_on, ends_on, closed_at");
  if (error) return { ok: false, code: "FORBIDDEN" };
  const seasons = (data ?? []) as SeasonRow[];
  if (seasonId) {
    const s = seasons.find((x) => x.id === seasonId);
    return s ? { ok: true, data: s } : { ok: false, code: "NOT_FOUND" };
  }
  return { ok: true, data: activeSeason(seasons, today) };
}

type Embedded = { full_name: string; coach_id: string; status: string; photo_path: string | null; photo_consent: boolean } | null;

/** Coach display names for these coach ids (chunked reads). */
async function coachNamesOf(coachIds: readonly string[]): Promise<Map<string, string>> {
  const service = createServiceClient();
  const names = new Map<string, string>();
  for (const ids of chunk([...new Set(coachIds)])) {
    const { data, error } = await service.from("profiles").select("id, full_name").in("id", ids);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) names.set(c.id as string, c.full_name as string);
  }
  return names;
}

/**
 * D30 (owner decision K1): a CLOSED season is shown from its frozen results (season_results — written once, inside
 * the close transaction, immutable: no update, no delete). It is never recomputed, so later
 * changes (a member deactivated or reactivated, a coach reassigned) cannot alter the final
 * standings. A closed preseason has no results (D20) → empty, final board.
 */
async function frozenLeaderboard(season: BoardSeason, viewer: Viewer): Promise<Leaderboard> {
  const service = createServiceClient();
  type Row = Omit<FrozenResultRow, "member_id"> & { member_id: string; members: Embedded };
  const rows = await fetchAll<Row>((from, to) =>
    service.from("season_results")
      .select("member_id, is_rookie, deadlift::text, bench::text, squat::text, pullups::text, pushups::text, treadmill::text, consistency::text, improvement_points::text, total::text, rank, rookie_rank, member_active, members(full_name, coach_id, status, photo_path, photo_consent)")
      .eq("season_id", season.id).order("member_id").range(from, to) as never);
  const coachNames = await coachNamesOf(rows.map((r) => r.members?.coach_id).filter((x): x is string => !!x));
  const members: SeasonInputs["members"] = new Map();
  for (const r of rows) {
    if (!r.members) continue;
    members.set(r.member_id, {
      id: r.member_id,
      full_name: r.members.full_name,
      coach_id: r.members.coach_id,
      coach_name: coachNames.get(r.members.coach_id) ?? null,
      // display-only here: the frozen ranks decide who is on the board, never today's status
      is_active: r.members.status === "active",
      photo_url: null,
      photo_path: r.members.photo_path,
      photo_consent: r.members.photo_consent,
    });
  }
  const ranked = rows.filter((r) => r.rank !== null || r.rookie_rank !== null).map((r) => r.member_id);
  await signPhotos(members, ranked.filter((id) => viewer.role === "admin" || members.get(id)?.coach_id === viewer.id));
  return buildFrozenLeaderboard(season, rows, members, viewer);
}

/** GET /api/leaderboard — the whole ranked season for an authenticated staff member. */
export async function getLeaderboard(
  client: SupabaseClient,
  viewer: Viewer,
  seasonId: string | undefined,
  today: IsoDate,
): Promise<Result<Leaderboard | null>> {
  const s = await seasonFor(client, seasonId, today);
  if (!s.ok) return s;
  if (!s.data) return { ok: true, data: null }; // no season running and none asked for
  const season: BoardSeason = { id: s.data.id, name: s.data.name, type: s.data.type, starts_on: s.data.starts_on, ends_on: s.data.ends_on };
  // D30: never present a live recomputation as the result of a closed season
  if (s.data.closed_at) return { ok: true, data: await frozenLeaderboard(season, viewer) };
  const inputs = await loadSeasonInputs(season);
  const standings = rankParticipants(season, inputs.participants);
  // sign only the photos this viewer will receive (board.ts: admin → all, coach → own clients)
  const shown = [...standings.main, ...standings.rookies]
    .map((r) => r.memberId)
    .filter((id) => viewer.role === "admin" || inputs.members.get(id)?.coach_id === viewer.id);
  await signPhotos(inputs.members, shown);
  return { ok: true, data: buildLeaderboard(season, standings, inputs.members, viewer) };
}

/**
 * Rank / total for every participant of the season (Members list, Today, member card): ONE
 * season computation for the whole page, never one per member. Only standings leave this
 * function (rank, list size, total) — no other member's data.
 */
export async function seasonStandings(season: BoardSeason): Promise<Map<string, Standing>> {
  if (season.type === "preseason") return new Map();
  const inputs = await loadSeasonInputs(season);
  return standingsByMember(rankParticipants(season, inputs.participants));
}

export interface DashboardBoard {
  board: Leaderboard;
  newBests: number;
  activity: SeasonActivity;
}

/** UX A1 (admin dashboard): the ranked season plus season statistics, from one read. */
export async function dashboardBoard(season: BoardSeason, viewer: Viewer, today: IsoDate, windowStart: IsoDate): Promise<DashboardBoard> {
  const inputs = await loadSeasonInputs(season);
  const standings = rankParticipants(season, inputs.participants);
  await signPhotos(inputs.members, standings.main.slice(0, 5).map((r) => r.memberId));
  return {
    board: buildLeaderboard(season, standings, inputs.members, viewer),
    newBests: season.type === "preseason" ? 0 : countNewBests(inputs.participants, season.starts_on),
    activity: seasonActivity(inputs.participants, season.starts_on, windowStart, today),
  };
}
