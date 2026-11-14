/**
 * Season integrity and the close contract (BR-S5, BR-S7, BR-S10, D20, D21, D27).
 * AC-22, AC-23, AC-41 … AC-44. Regression tests for audit findings S-2, S-4, G-10.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, today } from "@/lib/time";
import {
  ACTIVE_SEASON, ADMIN, COACH1, INACTIVE_MEMBER, PAST_SEASON,
  closerConnection, endedSeason, fakeResults, newMember, owner, service, signIn,
} from "./helpers";

let admin: SupabaseClient, coach1: SupabaseClient;
let closer: postgres.Sql;
beforeAll(async () => {
  [admin, coach1] = await Promise.all([signIn("admin@gym-arena.local"), signIn("coach1@gym-arena.local")]);
  closer = await closerConnection(4);
});
afterAll(async () => { await closer.end(); });

/** The real close sequence: one transaction, one connection (D21). */
const close = (seasonId: string, results: unknown[], actor = ADMIN) =>
  closer.begin(async (tx) => {
    await tx`select public.begin_season_close(${seasonId}, ${actor})`;
    await tx`select public.finish_season_close(${seasonId}, ${tx.json(results as never)})`;
  });
const state = async (id: string) => {
  const o = owner();
  const [row] = await o`select closed_at is not null as closed, closed_by,
    (select count(*)::int from public.season_results r where r.season_id = s.id) as results from public.seasons s where id = ${id}`;
  await o.end();
  return row;
};

describe("season rules", () => {
  it("AC-22: overlapping season fails; coach cannot create seasons", async () => {
    const r = await admin.from("seasons").insert({ name: "Overlap", type: "championship", starts_on: today(), ends_on: addDays(today(), 3) });
    expect(r.error?.message).toMatch(/seasons_no_overlap/);
    const c = await coach1.from("seasons").insert({ name: "X", type: "championship", starts_on: "2090-01-01", ends_on: "2090-01-31" });
    expect(c.error).not.toBeNull();
  });

  it("G-10 regression: ends_on cannot move before existing entries; extending is allowed (BR-S6)", async () => {
    const shrink = await admin.from("seasons").update({ ends_on: addDays(today(), -1) }).eq("id", ACTIVE_SEASON);
    expect(shrink.error?.message).toMatch(/ends_on cannot be before existing entries/);
    const { data: before } = await admin.from("seasons").select("ends_on").eq("id", ACTIVE_SEASON).single();
    const extended = addDays(before!.ends_on, 1);
    expect((await admin.from("seasons").update({ ends_on: extended }).eq("id", ACTIVE_SEASON)).error).toBeNull();
    expect((await admin.from("seasons").update({ ends_on: before!.ends_on }).eq("id", ACTIVE_SEASON)).error).toBeNull();
  });
});

describe("S-2 regression: a season is closed only by the close operation (AC-41)", () => {
  it("direct closed_at update is rejected for admin, service role and database owner", async () => {
    const s = await endedSeason("championship");
    const a = await admin.from("seasons").update({ closed_at: new Date().toISOString(), closed_by: ADMIN }).eq("id", s.id);
    expect(a.error?.message).toMatch(/closed only by the close operation/);
    const sv = await service.from("seasons").update({ closed_at: new Date().toISOString() }).eq("id", s.id);
    expect(sv.error).not.toBeNull();
    const o = owner();
    await expect(o`update public.seasons set closed_at = now() where id = ${s.id}`).rejects.toThrow(/closed only by the close operation/);
    await o.end();
    expect(await state(s.id)).toMatchObject({ closed: false, results: 0 });
  });

  it("a season cannot be inserted already closed — admin, service role or owner", async () => {
    const row = { name: "Pre-closed", type: "championship", starts_on: "1880-01-01", ends_on: "1880-01-31", closed_at: new Date().toISOString() };
    expect((await admin.from("seasons").insert(row)).error?.message).toMatch(/cannot be created closed/);
    expect((await service.from("seasons").insert(row)).error).not.toBeNull();
    const o = owner();
    await expect(o`insert into public.seasons (name, type, starts_on, ends_on, closed_at) values ('x', 'championship', '1880-01-01', '1880-01-31', now())`)
      .rejects.toThrow(/cannot be created closed/);
    await o.end();
  });

  it("frozen results cannot be written outside the close operation", async () => {
    const o = owner();
    await expect(o`insert into public.season_results (season_id, member_id, is_rookie, deadlift, bench, squat, pullups, pushups, treadmill, consistency, improvement_points, total, rank)
      values (${ACTIVE_SEASON}, ${INACTIVE_MEMBER}, false, 100, 100, 100, 150, 150, 200, 200, 600, 1000, 1)`).rejects.toThrow(/written only by the close operation/);
    await o.end();
    const r = await service.from("season_results").insert({ season_id: ACTIVE_SEASON, member_id: INACTIVE_MEMBER, is_rookie: false, deadlift: 0, bench: 0, squat: 0, pullups: 0, pushups: 0, treadmill: 0, consistency: 0, improvement_points: 0, total: 0, rank: 1 });
    expect(r.error?.message).toMatch(/written only by the close operation/);
  });

  it("AC-23: a closed season cannot be renamed, reopened or extended", async () => {
    for (const patch of [{ name: "Renamed" }, { closed_at: null }, { ends_on: addDays(today(), 30) }]) {
      const r = await admin.from("seasons").update(patch).eq("id", PAST_SEASON);
      expect(r.error?.message, JSON.stringify(patch)).toMatch(/SEASON_CLOSED/);
    }
  });
});

describe("close contract: begin_season_close / finish_season_close (D21)", () => {
  it("AC-42: happy path — one result per participant, closed atomically, audited with the admin", async () => {
    const s = await endedSeason("championship");
    await close(s.id, fakeResults(s.participants));
    expect(await state(s.id)).toMatchObject({ closed: true, closed_by: ADMIN, results: s.participants.length });
    const { data: audit } = await admin.from("audit_log").select("action, actor_id, after").eq("entity_id", s.id).eq("action", "season.close");
    expect(audit).toHaveLength(1);
    expect(audit![0].actor_id).toBe(ADMIN);
    expect(audit![0].after.results).toBe(s.participants.length);
    // frozen results are immutable
    const o = owner();
    await expect(o`update public.season_results set total = 999 where season_id = ${s.id}`).rejects.toThrow(/IMMUTABLE/);
    await o.end();
  });

  it("S-4 regression: empty, partial, or fabricated results close nothing", async () => {
    const s = await endedSeason("championship");
    await expect(close(s.id, [])).rejects.toThrow(/INCOMPLETE_RESULTS: a participant has no result/);
    await expect(close(s.id, fakeResults(s.participants.slice(1)))).rejects.toThrow(/INCOMPLETE_RESULTS: a participant has no result/);
    const o = owner();
    const [outsider] = await o`select id from public.members where id not in (select member_id from public.season_participants where season_id = ${s.id}) limit 1`;
    await o.end();
    if (outsider) {
      // the only non-participants are inactive members, so give the outsider an unranked row
      const extra = { ...fakeResults([outsider.id])[0], rank: null };
      await expect(close(s.id, [...fakeResults(s.participants), extra])).rejects.toThrow(/INCOMPLETE_RESULTS: result for a non-participant/);
    }
    await expect(close(s.id, [...fakeResults(s.participants), ...fakeResults(s.participants.slice(0, 1))])).rejects.toThrow(/duplicate key/);
    // every failure rolled back completely
    expect(await state(s.id)).toMatchObject({ closed: false, results: 0 });
  });

  it("only an active admin can start a close; not before the season has ended; not without begin", async () => {
    const s = await endedSeason("championship");
    await expect(close(s.id, fakeResults(s.participants), COACH1)).rejects.toThrow(/only an active admin closes a season/);
    await expect(close(ACTIVE_SEASON, [])).rejects.toThrow(/SEASON_NOT_ENDED/);
    await expect(close(PAST_SEASON, [])).rejects.toThrow(/SEASON_CLOSED/);
    await expect(closer`select public.finish_season_close(${s.id}, ${closer.json(fakeResults(s.participants) as never)})`)
      .rejects.toThrow(/CLOSE_NOT_STARTED/);
    // a malformed payload is rejected, not interpreted
    await expect(closer.begin(async (tx) => {
      await tx`select public.begin_season_close(${s.id}, ${ADMIN})`;
      await tx`select public.finish_season_close(${s.id}, '"not-an-array"'::jsonb)`;
    })).rejects.toThrow(/results must be a JSON array/);
    expect(await state(s.id)).toMatchObject({ closed: false, results: 0 });
  });

  it("AC-43: concurrent close requests → exactly one succeeds", async () => {
    const s = await endedSeason("championship");
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => close(s.id, fakeResults(s.participants))));
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    for (const o of outcomes) if (o.status === "rejected") expect(String(o.reason)).toMatch(/SEASON_CLOSED/);
    expect(await state(s.id)).toMatchObject({ closed: true, results: s.participants.length });
  });

  it("AC-43: an entry correction racing with a close waits for the lock, then fails with SEASON_CLOSED", async () => {
    const s = await endedSeason("championship");
    const o = owner();
    const [entry] = await o`
      insert into public.entries (member_id, season_id, category, performed_on, km, value, logged_by)
      values (${s.participants[0]}, ${s.id}, 'treadmill', ${s.startsOn}, 3, 0, ${ADMIN}) returning id`;
    await o.end();

    let editSettled = false;
    let edit: PromiseLike<{ error: { message: string } | null }> | undefined;
    await closer.begin(async (tx) => {
      await tx`select public.begin_season_close(${s.id}, ${ADMIN})`;          // exclusive season lock held
      edit = service.rpc("server_edit_entry", { p_actor: ADMIN, p_entry_id: entry.id, p_reason: "late fix", p_km: 9 })
        .then((r) => { editSettled = true; return r; });
      await new Promise((r) => setTimeout(r, 700));
      expect(editSettled).toBe(false);                                        // the write is waiting on the lock
      await tx`select public.finish_season_close(${s.id}, ${tx.json(fakeResults(s.participants) as never)})`;
    });
    const result = await edit!;
    expect(result.error?.message).toMatch(/SEASON_CLOSED/);
    const check = owner();
    const [after] = await check`select km::float as km from public.entries where id = ${entry.id}`;
    await check.end();
    expect(after.km).toBe(3);
  });

  it("AC-44 / D20: preseason close freezes entries, writes no results, has no reveal", async () => {
    const s = await endedSeason("preseason");
    const o = owner();
    const [entry] = await o`
      insert into public.entries (member_id, season_id, category, performed_on, reps, value, logged_by)
      values (${s.participants[0]}, ${s.id}, 'pushups', ${s.startsOn}, 20, 0, ${ADMIN}) returning id`;
    await o.end();
    await expect(close(s.id, fakeResults(s.participants))).rejects.toThrow(/a preseason has no results/);
    await close(s.id, []);
    expect(await state(s.id)).toMatchObject({ closed: true, closed_by: ADMIN, results: 0 });
    const v = await service.rpc("server_void_entry", { p_actor: ADMIN, p_entry_id: entry.id, p_reason: "x" });
    expect(v.error?.message).toMatch(/SEASON_CLOSED/);
    const reveal = await admin.from("seasons").update({ reveal_started_at: new Date().toISOString() }).eq("id", s.id);
    expect(reveal.error?.message).toMatch(/a preseason has no reveal/);
  });

  it("BR-S8: reveal can be started on a closed championship only", async () => {
    const s = await endedSeason("championship");
    const early = await admin.from("seasons").update({ reveal_started_at: new Date().toISOString() }).eq("id", s.id);
    expect(early.error?.message).toMatch(/reveal requires a closed season/);
    await close(s.id, fakeResults(s.participants));
    expect((await admin.from("seasons").update({ reveal_started_at: new Date().toISOString() }).eq("id", s.id)).error).toBeNull();
  });
});

describe("inactive participants at close (D29, BR-P5, AC-51, AC-52)", () => {
  /** A season whose participants include one member who became inactive during it. */
  async function seasonWithInactiveParticipant() {
    const member = await newMember(admin);
    const s = await endedSeason("championship");           // member is active → becomes a participant
    expect(s.participants).toContain(member.id);
    expect((await admin.from("members").update({ status: "inactive" }).eq("id", member.id)).error).toBeNull();
    const active = s.participants.filter((id) => id !== member.id);
    return { s, inactiveId: member.id, active };
  }
  const unranked = (id: string) => ({ ...fakeResults([id])[0], rank: null, total: 321, improvement_points: 231 });

  it("AC-51: a close that omits the inactive participant changes nothing", async () => {
    const { s, active } = await seasonWithInactiveParticipant();
    await expect(close(s.id, fakeResults(active))).rejects.toThrow(/INCOMPLETE_RESULTS: a participant has no result/);
    expect(await state(s.id)).toMatchObject({ closed: false, results: 0 });
  });

  it("AC-52: an inactive member can never be given a rank (main board or rookies)", async () => {
    const { s, inactiveId, active } = await seasonWithInactiveParticipant();
    const ranked = { ...unranked(inactiveId), rank: 1 };
    await expect(close(s.id, [...fakeResults(active), ranked])).rejects.toThrow(/season_results_check|an inactive member cannot be ranked/);
    const rookieRanked = { ...unranked(inactiveId), is_rookie: true, rookie_rank: 1 };
    await expect(close(s.id, [...fakeResults(active), rookieRanked])).rejects.toThrow(/season_results_check|an inactive member cannot be ranked/);
    expect(await state(s.id)).toMatchObject({ closed: false, results: 0 });
  });

  it("AC-51: their earned points are frozen, unranked and flagged; active members keep their ranks", async () => {
    const { s, inactiveId, active } = await seasonWithInactiveParticipant();
    // the caller cannot mark an inactive member as active
    await close(s.id, [...fakeResults(active), { ...unranked(inactiveId), member_active: true }]);
    expect(await state(s.id)).toMatchObject({ closed: true, results: s.participants.length });
    const { data: row } = await admin.from("season_results")
      .select("total, improvement_points, rank, rookie_rank, member_active").eq("season_id", s.id).eq("member_id", inactiveId).single();
    expect(row).toMatchObject({ rank: null, rookie_rank: null, member_active: false });
    expect(Number(row!.total)).toBe(321);
    const { data: ranked } = await admin.from("season_results")
      .select("rank, member_active").eq("season_id", s.id).not("rank", "is", null).order("rank");
    expect(ranked!.map((r) => r.rank)).toEqual(active.map((_, i) => i + 1));
    expect(ranked!.every((r) => r.member_active)).toBe(true);
    // history is preserved even though the member is inactive, and cannot be altered
    const o = owner();
    await expect(o`update public.season_results set rank = 1 where season_id = ${s.id} and member_id = ${inactiveId}`).rejects.toThrow(/IMMUTABLE/);
    await o.end();
  });
});

describe("D27: the season-close role has least privilege", () => {
  it("can read scoring inputs, but cannot write any table or reach anything else", async () => {
    const [{ n }] = await closer`select count(*)::int as n from public.entries`;
    expect(n).toBeGreaterThan(0);
    const denied: Array<[string, () => PromiseLike<unknown>]> = [
      ["insert results", () => closer`insert into public.season_results (season_id, member_id, is_rookie, deadlift, bench, squat, pullups, pushups, treadmill, consistency, improvement_points, total) values (${ACTIVE_SEASON}, ${INACTIVE_MEMBER}, true, 0,0,0,0,0,0,0,0,0)`],
      ["update seasons", () => closer`update public.seasons set name = 'x'`],
      ["update entries", () => closer`update public.entries set km = 1`],
      ["insert audit", () => closer`insert into public.audit_log (action, entity_type) values ('x', 'x')`],
      ["read profiles", () => closer`select * from public.profiles`],
      ["read settings (TV key)", () => closer`select * from public.app_settings`],
      ["read audit log", () => closer`select * from public.audit_log`],
      ["read auth users", () => closer`select * from auth.users`],
      ["server write fn", () => closer`select public.server_void_entry(${ADMIN}, ${ADMIN}, 'x')`],
      ["create table", () => closer`create table public.x (id int)`],
    ];
    for (const [name, attempt] of denied) {
      await expect(attempt(), name).rejects.toThrow(/permission denied/);
    }
  });

  it("no other role can call the close functions", async () => {
    for (const client of [admin, coach1, service]) {
      const r = await client.rpc("begin_season_close", { p_season_id: PAST_SEASON, p_actor: ADMIN });
      expect(r.error?.message).toMatch(/permission denied/);
    }
  });
});
