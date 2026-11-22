import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErrorCode } from "@/lib/api";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";
import type { IsoDate } from "@/lib/time";
import { Rational } from "@/modules/scoring";
import { rankParticipants, type BoardSeason, type Leaderboard, type Viewer } from "@/modules/leaderboard/board";
import { getLeaderboard, loadSeasonInputs } from "@/modules/leaderboard/service";
import { seasonStatus } from "./status";
import type { SeasonRow } from "./service";

/**
 * Season lifecycle reads and the reveal (M6): close preview, Start reveal, frozen results.
 * Seasons are read with the CALLER's client first (RLS); privileged reads go through the
 * service role only after that, and only return curated fields.
 */
export type LifecycleResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string };

const COLUMNS = "id, name, type, starts_on, ends_on, closed_at, reveal_started_at, created_at";

async function readSeason(client: SupabaseClient, id: string): Promise<SeasonRow | null> {
  const { data } = await client.from("seasons").select(COLUMNS).eq("id", id).maybeSingle<SeasonRow>();
  return data ?? null;
}

/**
 * Cheap eligibility check before opening the close transaction (which re-checks everything
 * under the lock): unknown → 404, closed → SEASON_CLOSED, not ended yet → CONFLICT not_ended.
 */
export async function closeEligibility(client: SupabaseClient, seasonId: string, today: IsoDate): Promise<LifecycleResult<SeasonRow>> {
  const s = await readSeason(client, seasonId);
  if (!s) return { ok: false, code: "NOT_FOUND" };
  const status = seasonStatus(s, today);
  if (status === "closed") return { ok: false, code: "SEASON_CLOSED" };
  if (status !== "ended") return { ok: false, code: "CONFLICT", reason: "not_ended" };
  return { ok: true, data: s };
}

export interface ClosePreview {
  season: { id: string; name: string; type: SeasonRow["type"]; starts_on: IsoDate; ends_on: IsoDate };
  can_close: boolean;
  /** why not: "not_ended" | "closed" */
  blocked: string | null;
  participants: number;
  ranked: number;
  rookies: number;
  /** members inactive now: scored at close, unranked (D29) */
  unranked: number;
  /** provisional top 3 (ties included — D10). Informational: the close recomputes inside its transaction. */
  top3: Array<{ rank: number; full_name: string; total: number }>;
  entries: number;
}

/**
 * GET /api/seasons/:id/close (admin) — the confirmation summary shown before closing (UX A2:
 * "confirmation summary of the final top 3"; a preseason: "baselines will be frozen"). The same
 * scoring module as the close itself; the close never trusts this preview (D21).
 */
export async function closePreview(client: SupabaseClient, seasonId: string, today: IsoDate): Promise<LifecycleResult<ClosePreview>> {
  const s = await readSeason(client, seasonId);
  if (!s) return { ok: false, code: "NOT_FOUND" };
  const status = seasonStatus(s, today);
  const season: BoardSeason = { id: s.id, name: s.name, type: s.type, starts_on: s.starts_on, ends_on: s.ends_on };
  const inputs = await loadSeasonInputs(season);
  const entries = inputs.participants.reduce((n, p) => n + p.entries.filter((e) => e.performedOn >= s.starts_on).length, 0);
  const standings = rankParticipants(season, inputs.participants);
  return {
    ok: true,
    data: {
      season,
      can_close: status === "ended",
      blocked: status === "closed" ? "closed" : status === "ended" ? null : "not_ended",
      participants: inputs.participants.length,
      ranked: standings.main.length,
      rookies: standings.rookies.length,
      unranked: inputs.participants.filter((p) => !p.isActive).length,
      top3: standings.main
        .filter((r) => r.rank <= 3)
        .map((r) => ({ rank: r.rank, full_name: inputs.members.get(r.memberId)?.full_name ?? "", total: r.total.roundHalfUp() })),
      entries,
    },
  };
}

/**
 * POST /api/seasons/:id/reveal (admin) — Start reveal (BR-S8). Championship only (409 for a
 * preseason — BR-S10), closed only. Pressing it again restarts the sequence on the TV. The
 * update runs with the admin's own client: the database allows only `reveal_started_at` to
 * change on a closed season and audits it (season.reveal).
 */
export async function startReveal(client: SupabaseClient, seasonId: string): Promise<LifecycleResult<SeasonRow>> {
  const s = await readSeason(client, seasonId);
  if (!s) return { ok: false, code: "NOT_FOUND" };
  if (s.type === "preseason") return { ok: false, code: "CONFLICT", reason: "preseason_no_reveal" };
  if (!s.closed_at) return { ok: false, code: "CONFLICT", reason: "not_closed" };
  const { data, error } = await client.from("seasons").update({ reveal_started_at: new Date().toISOString() }).eq("id", seasonId).select(COLUMNS).maybeSingle<SeasonRow>();
  if (error || !data) return { ok: false, code: "FORBIDDEN" };
  return { ok: true, data };
}

export interface UnrankedResult {
  member_id: string | null;
  full_name: string;
  total: number;
  member_active: false;
}

export interface SeasonResults {
  board: Leaderboard;
  /** members inactive at close: their frozen points, never a rank (D29) */
  unranked: UnrankedResult[];
}

/**
 * GET /api/seasons/:id/results (admin, coach) — the FROZEN results of a closed season (D30):
 * the ranked main board and rookies exactly as stored, plus the unranked rows of members who
 * were inactive at close, flagged member_active: false. The admin sees every unranked row; a
 * coach only their own clients' (the same privacy rule as the board — D31).
 */
export async function seasonResults(client: SupabaseClient, viewer: Viewer, seasonId: string, today: IsoDate): Promise<LifecycleResult<SeasonResults>> {
  const s = await readSeason(client, seasonId);
  if (!s) return { ok: false, code: "NOT_FOUND" };
  if (!s.closed_at) return { ok: false, code: "CONFLICT", reason: "not_closed" };
  const board = await getLeaderboard(client, viewer, seasonId, today);
  if (!board.ok || !board.data) return { ok: false, code: board.ok ? "NOT_FOUND" : board.code };
  type Row = { member_id: string; total: string; members: { full_name: string; coach_id: string } | null };
  const rows = await fetchAll<Row>((from, to) =>
    createServiceClient()
      .from("season_results")
      .select("member_id, total::text, members(full_name, coach_id)")
      .eq("season_id", seasonId)
      .is("rank", null)
      .is("rookie_rank", null)
      .order("member_id")
      .range(from, to) as never,
  );
  const unranked = rows
    .filter((r) => r.members && (viewer.role === "admin" || r.members.coach_id === viewer.id))
    .map((r) => ({ member_id: r.member_id, full_name: r.members!.full_name, total: Rational.from(r.total).roundHalfUp(), member_active: false as const }));
  return { ok: true, data: { board: board.data, unranked } };
}

export interface HistorySeason {
  id: string;
  name: string;
  type: SeasonRow["type"];
  starts_on: IsoDate;
  ends_on: IsoDate;
  closed_at: string;
  revealed: boolean;
}

/** Closed seasons, newest first (Season history — BR-W2, UX C7). */
export async function closedSeasons(client: SupabaseClient): Promise<HistorySeason[]> {
  const { data, error } = await client.from("seasons").select(COLUMNS).not("closed_at", "is", null).order("ends_on", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SeasonRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    starts_on: s.starts_on,
    ends_on: s.ends_on,
    closed_at: s.closed_at!,
    revealed: s.reveal_started_at !== null,
  }));
}
