import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";
import { rankParticipants, type BoardSeason } from "@/modules/leaderboard/board";
import type { ParticipantHistory } from "@/modules/scoring";
import type { IsoDate } from "@/lib/time";
import { historyBefore, type SnapshotRow } from "./payload";

/**
 * Daily rank snapshots (DATABASE_SCHEMA daily_rank_snapshots, D9, AC-30) — the existing table,
 * written by the server only (authenticated has no insert; the service role writes here).
 *
 * The snapshot of day D is the main board at the START of D: the same scoring module run on the
 * data dated before D (payload.historyBefore). It is written once per season and day (primary
 * key; a second writer changes nothing) by the scheduled job (POST /api/cron/snapshot), and —
 * if the job has not run yet — by the first TV request of the day, which computes exactly the
 * same rows. Only active, non-rookie participants of a championship are stored (the TV shows
 * movement on the main board only).
 */
const written = new Map<string, IsoDate>(); // season id → last day this process knows is written

export async function readSnapshot(seasonId: string, day: IsoDate): Promise<Map<string, SnapshotRow> | null> {
  const rows = await fetchAll<SnapshotRow>((from, to) =>
    createServiceClient()
      .from("daily_rank_snapshots")
      .select("member_id, rank, total::text")
      .eq("season_id", seasonId)
      .eq("snapshot_on", day)
      .order("member_id")
      .range(from, to) as never,
  );
  if (rows.length === 0) return null;
  return new Map(rows.map((r) => [r.member_id, r]));
}

/** Writes the snapshot of `day` unless it exists. Returns the number of rows written (0 = already there). */
export async function ensureDailySnapshot(season: BoardSeason, participants: readonly ParticipantHistory[], day: IsoDate): Promise<number> {
  if (season.type !== "championship") return 0;
  if (written.get(season.id) === day) return 0;
  const service = createServiceClient();
  const { count, error: countError } = await service
    .from("daily_rank_snapshots")
    .select("member_id", { count: "exact", head: true })
    .eq("season_id", season.id)
    .eq("snapshot_on", day);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    written.set(season.id, day);
    return 0;
  }
  const atStart = rankParticipants(season, participants.map((p) => historyBefore(p, day)));
  const rows = atStart.main.map((r) => ({
    season_id: season.id,
    member_id: r.memberId,
    snapshot_on: day,
    rank: r.rank,
    total: r.total.toFixed(4),
  }));
  if (rows.length > 0) {
    // ignoreDuplicates: a concurrent writer (job + TV) cannot overwrite or fail the other
    const { error } = await service.from("daily_rank_snapshots").upsert(rows, { onConflict: "season_id,member_id,snapshot_on", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  written.set(season.id, day);
  return rows.length;
}
