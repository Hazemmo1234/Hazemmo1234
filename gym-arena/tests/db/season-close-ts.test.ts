/**
 * The REAL TypeScript close operation (modules/seasons/close-core.ts — what POST
 * /api/seasons/:id/close runs) on the restricted role arena_season_closer, one transaction
 * on one connection (D21, D27). AC-23, AC-42, AC-43, AC-44, AC-51, AC-52.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeError, runSeasonClose } from "@/modules/seasons/close-core";
import { ACTIVE_SEASON, ADMIN, COACH1, closerConnection, endedSeason, newMember, owner, signIn } from "./helpers";

let admin: SupabaseClient;
let closer: postgres.Sql;
beforeAll(async () => {
  admin = await signIn("admin@gym-arena.local");
  closer = await closerConnection(4);
});
afterAll(async () => {
  await closer.end();
});

async function frozen(seasonId: string) {
  const o = owner();
  try {
    const rows = await o`select member_id, rank, rookie_rank, member_active, total::text as total from public.season_results where season_id = ${seasonId}`;
    const [s] = await o`select closed_at is not null as closed, closed_by from public.seasons where id = ${seasonId}`;
    const audit = await o`select count(*)::int as n from public.audit_log where action = 'season.close' and entity_id = ${seasonId}`;
    return { rows, closed: s!.closed as boolean, closedBy: s!.closed_by as string | null, audits: audit[0]!.n as number };
  } finally {
    await o.end();
  }
}

describe("runSeasonClose — the server close path on the restricted role", () => {
  it("championship: one frozen result per participant, inactive members unranked, closed and audited", async () => {
    const gone = await newMember(admin); // participant of the season below, then deactivated
    const s = await endedSeason("championship");
    expect(s.participants).toContain(gone.id);
    expect((await admin.from("members").update({ status: "inactive" }).eq("id", gone.id)).error).toBeNull();

    const summary = await runSeasonClose(closer, s.id, ADMIN);
    expect(summary).toMatchObject({ season_id: s.id, type: "championship", results: s.participants.length });

    const f = await frozen(s.id);
    expect(f.closed).toBe(true);
    expect(f.closedBy).toBe(ADMIN);
    expect(f.audits).toBe(1);
    expect(f.rows).toHaveLength(s.participants.length);
    expect(new Set(f.rows.map((r) => r.member_id))).toEqual(new Set(s.participants));
    const inactive = f.rows.find((r) => r.member_id === gone.id)!;
    expect(inactive).toMatchObject({ rank: null, rookie_rank: null, member_active: false });
    for (const r of f.rows.filter((x) => x.member_active)) expect(r.rank !== null || r.rookie_rank !== null).toBe(true);
  });

  it("a second close is refused and changes nothing; concurrent closes: exactly one succeeds", async () => {
    const s = await endedSeason("championship");
    const results = await Promise.allSettled([runSeasonClose(closer, s.id, ADMIN), runSeasonClose(closer, s.id, ADMIN)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(closeError((failed.reason as Error).message)).toEqual({ code: "SEASON_CLOSED" });
    const before = await frozen(s.id);
    await expect(runSeasonClose(closer, s.id, ADMIN)).rejects.toThrow(/SEASON_CLOSED/);
    const after = await frozen(s.id);
    expect(after.rows).toHaveLength(before.rows.length);
    expect(after.audits).toBe(1);
  });

  it("preseason: closed with no results (BR-S10, D20)", async () => {
    const s = await endedSeason("preseason");
    expect(await runSeasonClose(closer, s.id, ADMIN)).toMatchObject({ type: "preseason", results: 0, winners: [] });
    const f = await frozen(s.id);
    expect(f.closed).toBe(true);
    expect(f.rows).toHaveLength(0);
  });

  it("refusals roll back: not ended (409 CONFLICT), not an admin (403), unknown season (404)", async () => {
    await expect(runSeasonClose(closer, ACTIVE_SEASON, ADMIN)).rejects.toThrow(/SEASON_NOT_ENDED/);
    expect(closeError("SEASON_NOT_ENDED: close allowed only after ends_on")).toEqual({ code: "CONFLICT", reason: "not_ended" });
    const s = await endedSeason("championship");
    await expect(runSeasonClose(closer, s.id, COACH1)).rejects.toThrow(/FORBIDDEN/);
    expect((await frozen(s.id)).closed).toBe(false);
    await expect(runSeasonClose(closer, "00000000-0000-4000-b000-0000000000ff", ADMIN)).rejects.toThrow(/NOT_FOUND/);
    expect(closeError("connection refused")).toEqual({ code: "UNKNOWN", reason: "close_failed" });
  });
});
