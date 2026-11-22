/**
 * The season-close transaction body (D21), separated from the connection handling in close.ts
 * so the database suite can run the REAL close path on a disposable stack. No server-only
 * import here; the caller supplies a connection that uses the restricted role.
 */
import type postgres from "postgres";
import type { ErrorCode } from "@/lib/api";
import type { CategoryCode } from "@/lib/supabase/types";
import { participantHistory, type AttendanceRecordRow, type EntryRecord } from "@/modules/entries/card";
import { scoreSeason, type ParticipantHistory, type SeasonStandings } from "@/modules/scoring";
import { frozenResultRows, type FrozenResultInput } from "./results";

export type CloseResult =
  | { ok: true; data: { season_id: string; type: "preseason" | "championship"; closed_at: string; results: number; winners: Array<{ member_id: string; rank: number }> } }
  | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string };

/** Database refusals → stable API code + reason (the message never reaches the user). */
export function closeError(message: string | undefined): { code: ErrorCode | "UNKNOWN"; reason?: string } {
  const m = message ?? "";
  if (m.startsWith("SEASON_CLOSED")) return { code: "SEASON_CLOSED" };
  if (m.startsWith("SEASON_NOT_ENDED")) return { code: "CONFLICT", reason: "not_ended" };
  if (m.startsWith("NOT_FOUND")) return { code: "NOT_FOUND" };
  if (m.startsWith("FORBIDDEN")) return { code: "FORBIDDEN" };
  if (m.startsWith("INCOMPLETE_RESULTS") || m.startsWith("VALIDATION")) return { code: "VALIDATION", reason: "incomplete" };
  return { code: "UNKNOWN", reason: "close_failed" };
}

type SeasonRow = { id: string; type: "preseason" | "championship"; starts_on: string; ends_on: string; closed_at: string | null };

/** The season's scoring inputs, read on the transaction's connection (never truncated). */
export async function readInputs(tx: postgres.TransactionSql, season: SeasonRow): Promise<ParticipantHistory[]> {
  const participants = await tx<Array<{ member_id: string; planned_sessions: number; status: string }>>`
    select sp.member_id, sp.planned_sessions, m.status::text as status
    from public.season_participants sp join public.members m on m.id = sp.member_id
    where sp.season_id = ${season.id}
    order by sp.member_id`;
  // pre-season best per (member, category) — the same selection as leaderboard_baselines
  const baselines = await tx<Array<Omit<EntryRecord, "id" | "photo_path" | "logged_by" | "created_at" | "voided_at">>>`
    select distinct on (e.member_id, e.category)
           e.member_id, e.category::text as category, e.performed_on::text as performed_on,
           e.weight_kg::text as weight_kg, e.reps, e.km::text as km
    from public.season_participants sp
    join public.entries e on e.member_id = sp.member_id and e.performed_on < ${season.starts_on}::date and e.voided_at is null
    where sp.season_id = ${season.id}
    order by e.member_id, e.category, e.value desc, e.id`;
  const entries = await tx<Array<Omit<EntryRecord, "photo_path" | "logged_by" | "created_at" | "voided_at">>>`
    select e.id, e.member_id, e.category::text as category, e.performed_on::text as performed_on,
           e.weight_kg::text as weight_kg, e.reps, e.km::text as km
    from public.entries e
    where e.season_id = ${season.id} and e.voided_at is null
    order by e.id`;
  const attendance = await tx<Array<{ member_id: string; attended_on: string }>>`
    select a.member_id, a.attended_on::text as attended_on
    from public.attendance a
    where a.season_id = ${season.id} and a.voided_at is null
    order by a.id`;

  const byMember = new Map<string, EntryRecord[]>();
  const add = (e: EntryRecord) => byMember.set(e.member_id, [...(byMember.get(e.member_id) ?? []), e]);
  for (const b of baselines) add({ id: "", photo_path: null, logged_by: "", created_at: "", voided_at: null, ...b, category: b.category as CategoryCode });
  for (const e of entries) add({ photo_path: null, logged_by: "", created_at: "", voided_at: null, ...e, category: e.category as CategoryCode });
  const att = new Map<string, AttendanceRecordRow[]>();
  for (const a of attendance) att.set(a.member_id, [...(att.get(a.member_id) ?? []), { member_id: a.member_id, attended_on: a.attended_on, voided_at: null }]);

  return participants.map((p) => ({
    ...participantHistory(p.member_id, p.planned_sessions, byMember.get(p.member_id) ?? [], att.get(p.member_id) ?? []),
    isActive: p.status === "active",
  }));
}

export type CloseSummary = Extract<CloseResult, { ok: true }>["data"];

/**
 * One close, inside ONE transaction on `sql` (max 1 connection): lock → read → score → freeze.
 * Throws the database's error on refusal (SEASON_CLOSED, SEASON_NOT_ENDED, FORBIDDEN, …); any
 * error rolls back everything.
 */
export async function runSeasonClose(sql: postgres.Sql, seasonId: string, actorId: string): Promise<CloseSummary> {
  return sql.begin(async (tx) => {
    const [season] = await tx<SeasonRow[]>`
      select id, type::text as type, starts_on::text as starts_on, ends_on::text as ends_on, closed_at
      from public.begin_season_close(${seasonId}, ${actorId})`;
    if (!season) throw new Error("NOT_FOUND");
    let rows: FrozenResultInput[] = [];
    let standings: SeasonStandings | null = null;
    if (season.type === "championship") {
      const participants = await readInputs(tx, season);
      standings = scoreSeason({ type: "championship", startsOn: season.starts_on, endsOn: season.ends_on }, participants);
      rows = frozenResultRows(standings);
      // completeness is also verified by the database; checked here first for a clear error
      if (rows.length !== participants.length) throw new Error("INCOMPLETE_RESULTS");
    }
    const [closed] = await tx<Array<{ closed_at: string }>>`
      select closed_at::text as closed_at from public.finish_season_close(${seasonId}, ${tx.json(rows as never)})`;
    return {
      season_id: season.id,
      type: season.type,
      closed_at: closed?.closed_at ?? new Date().toISOString(),
      results: rows.length,
      winners: (standings?.main ?? []).filter((r) => r.rank <= 3).map((r) => ({ member_id: r.memberId, rank: r.rank })),
    };
  }) as Promise<CloseSummary>;
}
