/**
 * M4 leaderboard: correctness, ties, security and scale — on the real database.
 *
 * Ranking rules (SCORING §5): total desc → improvement desc → consistency desc → shared rank
 * (1, 1, 3), all on full-precision values; rookies on their own list (BR-R2); inactive members
 * never on a live board (BR-P5); preseason has no ranking. The scoring module implements them;
 * these tests prove the leaderboard data path feeds it correctly and leaks nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { today } from "@/lib/time";
import { participantHistory, type AttendanceRecordRow, type EntryRecord } from "@/modules/entries/card";
import { memberSeasonValues, scoreMember, scoreSeason } from "@/modules/scoring";
import { ACTIVE_SEASON, ADMIN, COACH1, anon, closerConnection, inactiveProbeCoach, owner, service, signIn } from "./helpers";

vi.mock("server-only", () => ({})); // trusted server-side caller
const { getLeaderboard, loadSeasonInputs, seasonStandings } = await import("@/modules/leaderboard/service");
const { rankParticipants } = await import("@/modules/leaderboard/board");

const COACH3 = "00000000-0000-4000-a000-000000000013";
let admin: SupabaseClient, coach1: SupabaseClient;
let tie: { seasonId: string; ids: Record<"A" | "B" | "C" | "D" | "E", string> };

/**
 * Idempotent tie fixture (tests/FIXTURES.md, reserved year 1654): members A–E (coach 3) with a
 * pull-ups baseline in "M4 tie baseline" (1654-01) and treadmill results in "M4 tie season"
 * (1654-03) chosen so that two members tie exactly, and two others show the same rounded total
 * with different exact totals. Members are created BEFORE the seasons so both enrol them.
 */
async function tieFixture() {
  const o = owner();
  try {
    const names = ["A", "B", "C", "D", "E"] as const;
    const ids = {} as Record<(typeof names)[number], string>;
    for (const [i, n] of names.entries()) {
      let [m] = await o`select id from public.members where full_name = ${`M4 tie ${n}`} order by member_code limit 1`;
      if (!m) [m] = await o`insert into public.members (full_name, phone, coach_id) values (${`M4 tie ${n}`}, ${`+20154650000${i}`}, ${COACH3}::uuid) returning id`;
      ids[n] = m.id as string;
    }
    for (const [name, start, end] of [["M4 tie baseline", "1654-01-01", "1654-01-28"], ["M4 tie season", "1654-03-01", "1654-03-28"]] as const) {
      await o`insert into public.seasons (name, type, starts_on, ends_on)
              select ${name}, 'championship', ${start}::date, ${end}::date
              where not exists (select 1 from public.seasons where name = ${name})`;
    }
    const add = async (member: string, category: string, day: string, reps: number | null, km: number | null) =>
      o`insert into public.entries (member_id, season_id, category, performed_on, reps, km, value, logged_by)
        select ${member}::uuid, '00000000-0000-0000-0000-000000000000', ${category}::public.category_code, ${day}::date, ${reps}, ${km}, 0, ${COACH3}::uuid
        where not exists (select 1 from public.entries where member_id = ${member}::uuid and category = ${category}::public.category_code and performed_on = ${day}::date and voided_at is null)`;
    for (const n of names) await add(ids[n], "pullups", "1654-01-10", 5, null); // baseline → not rookies
    // treadmill points = 4 × km; each entry also records one attendance day (consistency 200/12)
    await add(ids.A, "treadmill", "1654-03-05", null, 2.5); // 10 + 16.67 = 26.67 → shows 27
    await add(ids.B, "treadmill", "1654-03-06", null, 2.5); // exact tie with A
    await add(ids.C, "treadmill", "1654-03-07", null, 2.4); //  9.6 + 16.67 = 26.27
    await add(ids.E, "treadmill", "1654-03-08", null, 2.6); // 10.4 + 16.67 = 27.07 → also shows 27
    // D: baseline only, nothing this season → 0
    const [s] = await o`select id from public.seasons where name = 'M4 tie season'`;
    return { seasonId: s.id as string, ids };
  } finally {
    await o.end();
  }
}

const COACH2 = "00000000-0000-4000-a000-000000000012";
type BoardSeasonRow = { id: string; name: string; type: "championship"; starts_on: string; ends_on: string };

/**
 * Scale fixture (tests/FIXTURES.md, reserved year 1657). The leaderboard must be proven at a
 * realistic scale (> 1000 participants, most of them WITH results) on any database — a fresh
 * one holding only the seed, or one where other tests and earlier runs already left thousands of
 * members — independently of which test files ran before.
 *  1. At least SCALE_MEMBERS DEDICATED members "M4 scale fixture NNNN" exist (coaches 1–3 in
 *     turn, deterministic phones). Their count never depends on any other member: missing ones
 *     are created after the highest existing fixture number.
 *  2. The seasons "M4 scale baseline" (1657-01) and "M4 scale season" (1657-03) exist.
 *  3. EVERY fixture member is enrolled in the scale season — explicitly, not only through the
 *     enrolment a new season performs (which misses members created after the season).
 *  4. Deterministic results, a pure function of the member number n: pull-ups baselines for
 *     n % 3 ≠ 0 and bench baselines for n % 5 = 1 (everyone else is a rookie); in season pull-ups
 *     for everyone, bench progress for n % 5 = 1, treadmill for even n.
 * Every write is guarded (names, member + season, member + category + day): re-runs add
 * nothing, and nothing outside the fixture's own members, seasons and entries is touched.
 */
const SCALE_MEMBERS = 1100;
const SCALE_FX = "M4 scale fixture %";
type ScaleFixture = { season: BoardSeasonRow; numbers: number[]; ids: Map<string, number> };
async function scaleFixture(): Promise<ScaleFixture> {
  const o = owner();
  try {
    const [{ top, have }] = await o`select coalesce(max(substring(full_name from 18)::int), 0) as top, count(*)::int as have
                                    from public.members where full_name like ${SCALE_FX}`;
    if (have < SCALE_MEMBERS) {
      await o`insert into public.members (full_name, phone, coach_id)
              select 'M4 scale fixture ' || lpad(g::text, 4, '0'), '+20154657' || lpad(g::text, 4, '0'),
                     (array[${COACH1}::uuid, ${COACH2}::uuid, ${COACH3}::uuid])[1 + g % 3]
              from generate_series(${top + 1}::int, ${top + SCALE_MEMBERS - have}::int) g`;
    }
    for (const [name, start, end] of [["M4 scale baseline", "1657-01-01", "1657-01-28"], ["M4 scale season", "1657-03-01", "1657-03-28"]] as const) {
      await o`insert into public.seasons (name, type, starts_on, ends_on)
              select ${name}, 'championship', ${start}::date, ${end}::date
              where not exists (select 1 from public.seasons where name = ${name})`;
    }
    const [season] = await o`select id, name, type, starts_on::text, ends_on::text from public.seasons where name = 'M4 scale season'`;
    await o`insert into public.season_participants (season_id, member_id)
            select ${season.id}::uuid, m.id from public.members m where m.full_name like ${SCALE_FX}
            on conflict do nothing`;
    await o.unsafe(`
      with fx as (select id, substring(full_name from 18)::int as n from public.members where full_name like 'M4 scale fixture %'),
      rows (member_id, category, day, weight_kg, reps, km) as (
        select id, 'pullups', date '1657-01-10', null::numeric, 3 + n % 15, null::numeric from fx where n % 3 <> 0
        union all select id, 'bench', date '1657-01-11', 40 + (n % 20) * 2.5, 5, null from fx where n % 5 = 1
        union all select id, 'pullups', date '1657-03-05', null, case when n % 3 <> 0 then 3 + n % 15 + n % 4 else 5 + n % 7 end, null from fx
        union all select id, 'bench', date '1657-03-07', 42.5 + (n % 20) * 2.5, 5, null from fx where n % 5 = 1
        union all select id, 'treadmill', date '1657-03-06', null, null, 0.5 + (n % 30) / 10.0 from fx where n % 2 = 0
      )
      insert into public.entries (member_id, season_id, category, performed_on, weight_kg, reps, km, value, logged_by)
      select r.member_id, '00000000-0000-0000-0000-000000000000', r.category::public.category_code, r.day, r.weight_kg, r.reps, r.km, 0, '${COACH3}'
      from rows r
      where not exists (select 1 from public.entries e where e.member_id = r.member_id and e.category = r.category::public.category_code and e.performed_on = r.day and e.voided_at is null)`);
    const fx = await o`select id, substring(full_name from 18)::int as n from public.members where full_name like ${SCALE_FX}`;
    return { season: season as unknown as BoardSeasonRow, numbers: fx.map((r) => r.n as number), ids: new Map(fx.map((r) => [r.id as string, r.n as number])) };
  } finally {
    await o.end();
  }
}

/**
 * Consented-photo fixture (tests/FIXTURES.md): member "M4 photo fixture" of COACH 2 — another
 * coach than coach 1 — with photo consent and a real (tiny, synthetic) avatar object at
 * members/<member_id>/<uuid>.webp, created through the service role. Created during the active
 * season, the member is enrolled in it (BR-P4). Idempotent: reused when it already exists.
 */
const TINY_WEBP = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");
async function photoFixture(): Promise<{ id: string; path: string }> {
  const o = owner();
  try {
    let [m] = await o`select id, photo_path from public.members where full_name = 'M4 photo fixture' order by member_code limit 1`;
    if (!m) [m] = await o`insert into public.members (full_name, phone, coach_id) values ('M4 photo fixture', '+201546580000', ${COACH2}::uuid) returning id, photo_path`;
    if (!m.photo_path) {
      const path = `members/${m.id}/${crypto.randomUUID()}.webp`;
      const up = await service.storage.from("avatars").upload(path, TINY_WEBP, { contentType: "image/webp", upsert: false });
      if (up.error) throw new Error(`avatar fixture upload failed: ${up.error.message}`);
      await o`update public.members set photo_path = ${path}, photo_consent = true where id = ${m.id}`;
      m.photo_path = path;
    }
    return { id: m.id as string, path: m.photo_path as string };
  } finally {
    await o.end();
  }
}

beforeAll(async () => {
  [admin, coach1] = await Promise.all([signIn("admin@gym-arena.local"), signIn("coach1@gym-arena.local")]);
  tie = await tieFixture();
}, 120_000);

describe("leaderboard correctness", () => {
  /** The optimized read (best pre-season row per category) must rank EXACTLY like M1 on the full history. */
  async function expectEquivalent(seasonId: string) {
    const o = owner();
    const [season] = await o`select id, name, type, starts_on::text, ends_on::text from public.seasons where id = ${seasonId}`;
    await o.end();
    const inputs = await loadSeasonInputs(season as never);
    const fast = scoreSeason({ type: season.type, startsOn: season.starts_on, endsOn: season.ends_on }, inputs.participants);

    // reference: every non-voided entry of every participant up to the season end
    const parts = await fetchAll<{ member_id: string; planned_sessions: number; members: { status: string } }>((f, t) =>
      service.from("season_participants").select("member_id, planned_sessions, members(status)").eq("season_id", seasonId).order("member_id").range(f, t) as never);
    const ids = parts.map((p) => p.member_id);
    const entries: EntryRecord[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      entries.push(...(await fetchAll<EntryRecord>((f, t) =>
        service.from("entries").select("id, member_id, category, performed_on, weight_kg::text, reps, km::text, photo_path, logged_by, created_at, voided_at")
          .in("member_id", ids.slice(i, i + 100)).lte("performed_on", season.ends_on).is("voided_at", null).order("id").range(f, t) as never)));
    }
    const att = await fetchAll<AttendanceRecordRow>((f, t) =>
      service.from("attendance").select("member_id, attended_on, voided_at").eq("season_id", seasonId).is("voided_at", null).order("id").range(f, t) as never);
    const full = scoreSeason({ type: season.type, startsOn: season.starts_on, endsOn: season.ends_on }, parts.map((p) => ({
      ...participantHistory(p.member_id, p.planned_sessions, entries.filter((e) => e.member_id === p.member_id), att.filter((a) => a.member_id === p.member_id)),
      isActive: p.members.status === "active",
    })));
    const key = (rows: typeof fast.main) => rows.map((r) => `${r.memberId}:${r.rank}:${r.total.toString()}`);
    expect(key(fast.main)).toEqual(key(full.main));
    expect(key(fast.rookies)).toEqual(key(full.rookies));
    expect(fast.unranked.map((u) => u.memberId).sort()).toEqual(full.unranked.map((u) => u.memberId).sort());
    return fast;
  }

  it("the optimized read ranks EXACTLY like the full history — seed season", async () => {
    const fast = await expectEquivalent(ACTIVE_SEASON);
    expect(fast.main.length + fast.rookies.length).toBeGreaterThan(0);
  });

  it("the optimized read ranks EXACTLY like the full history — at realistic scale (> 1000 participants)", async () => {
    const { season, numbers, ids } = await scaleFixture();
    // 1. dedicated fixture members, independent of every other member on the stack
    expect(numbers.length).toBeGreaterThanOrEqual(SCALE_MEMBERS);
    // 2. every one of them is enrolled in the scale season
    const o = owner();
    const [{ enrolled }] = await o`select count(*)::int as enrolled from public.season_participants sp join public.members m on m.id = sp.member_id
                                   where sp.season_id = ${season.id} and m.full_name like ${SCALE_FX}`;
    // 3. every expected result exists — exactly the deterministic set, no more, no less
    const [{ results }] = await o`select count(*)::int as results from public.entries e join public.members m on m.id = e.member_id
                                  where m.full_name like ${SCALE_FX} and e.voided_at is null and e.performed_on between '1657-01-01' and '1657-03-28'`;
    await o.end();
    expect(enrolled).toBe(numbers.length);
    const expected = numbers.reduce((sum, n) => sum + (n % 3 !== 0 ? 1 : 0) + (n % 5 === 1 ? 2 : 0) + 1 + (n % 2 === 0 ? 1 : 0), 0);
    expect(results).toBe(expected);

    // 5. the optimized read ranks exactly like M1 on the full history, at > 1000 participants
    const fast = await expectEquivalent(season.id);
    expect(fast.main.length + fast.rookies.length).toBeGreaterThan(1000);
    // 4. every fixture member takes part — on the main board, or on the rookie list exactly
    //    when they have no pre-season result — and most of them have points
    const board = new Map([...fast.main.map((r) => [r.memberId, "main"] as const), ...fast.rookies.map((r) => [r.memberId, "rookies"] as const)]);
    for (const [id, n] of ids) expect(board.get(id), `fixture ${n}`).toBe(n % 3 !== 0 || n % 5 === 1 ? "main" : "rookies");
    const scored = [...fast.main, ...fast.rookies].filter((r) => ids.has(r.memberId) && r.total.toNumber() > 0).length;
    expect(scored).toBeGreaterThan(numbers.length / 2);
  }, 180_000);

  it("ties share a rank (1, 2, 2, 4); equal displayed totals with different exact totals do not tie", async () => {
    const r = await getLeaderboard(admin, { id: "admin", role: "admin" }, tie.seasonId, today());
    expect(r.ok).toBe(true);
    const board = (r as { data: NonNullable<Extract<typeof r, { ok: true }>["data"]> }).data;
    const row = (id: string) => board.main.find((x) => x.member_id === id)!;
    expect(row(tie.ids.E)).toMatchObject({ rank: 1, total_display: 27 });
    expect(row(tie.ids.A)).toMatchObject({ rank: 2, total_display: 27 });
    expect(row(tie.ids.B).rank).toBe(2);
    expect(row(tie.ids.A).total).toBe(row(tie.ids.B).total);
    expect(row(tie.ids.C).rank).toBe(4);
    expect(row(tie.ids.D)).toMatchObject({ rank: 5, total: 0 });
    // the scored members lead; every other non-rookie participant (members with older history,
    // e.g. other far-past fixtures) has 0 points this season and shares rank 5 with D
    expect(board.main.slice(0, 4).map((x) => x.member_id).sort()).toEqual([tie.ids.A, tie.ids.B, tie.ids.C, tie.ids.E].sort());
    for (const x of board.main.slice(4)) expect(x).toMatchObject({ rank: 5, total: 0 });
    expect(board.rookies.every((x) => x.is_rookie)).toBe(true);
    // deterministic: the same order every time
    const again = await getLeaderboard(admin, { id: "admin", role: "admin" }, tie.seasonId, today());
    expect((again as typeof r & { ok: true }).data!.main.map((x) => x.member_id)).toEqual(board.main.map((x) => x.member_id));
  });

  it("live boards exclude inactive members and rookies stay off the main board (BR-P5, BR-R2)", async () => {
    const r = await getLeaderboard(admin, { id: "admin", role: "admin" }, ACTIVE_SEASON, today());
    const board = (r as { ok: true; data: NonNullable<unknown> } & { data: { main: { member_id: string; is_rookie: boolean }[]; rookies: { member_id: string; is_rookie: boolean }[] } }).data;
    const o = owner();
    const inactive = new Set((await o`select id from public.members where status <> 'active'`).map((m) => m.id as string));
    await o.end();
    for (const x of [...board.main, ...board.rookies]) expect(inactive.has(x.member_id)).toBe(false);
    expect(board.main.every((x) => !x.is_rookie)).toBe(true);
    expect(board.rookies.every((x) => x.is_rookie)).toBe(true);
  });

  it("rank/total lookups agree with the board (AC-20) — one computation per season", async () => {
    const o = owner();
    const [season] = await o`select id, name, type, starts_on::text, ends_on::text from public.seasons where id = ${tie.seasonId}`;
    await o.end();
    const standings = await seasonStandings(season as never);
    const r = await getLeaderboard(admin, { id: "admin", role: "admin" }, tie.seasonId, today());
    const board = (r as { data: { main: { member_id: string; rank: number; total: number; total_display: number }[]; rookies: { member_id: string; rank: number; total: number; total_display: number }[] } }).data;
    expect(standings.get(tie.ids.E)).toMatchObject({ rank: 1, list: "main", total_display: 27 });
    expect(standings.get(tie.ids.D)).toMatchObject({ rank: 5, total: 0 });
    // every row of both boards: same rank, same list size, same total
    for (const [list, rows] of [["main", board.main], ["rookies", board.rookies]] as const) {
      for (const x of rows) expect(standings.get(x.member_id)).toEqual({ rank: x.rank, of: rows.length, list, total: x.total, total_display: x.total_display });
    }
  });
});

/**
 * Edge-case equivalence fixture (tests/FIXTURES.md, reserved year 1655). Each member isolates
 * one way the optimized read (best pre-season row per category, by stored value) could differ
 * from M1's full-history path:
 *  A — bench before the season: 100×3 (e1RM 110), 95×5 (e1RM 110.83 — the true best despite the
 *      lighter weight) and a VOIDED 120×5 (140); pull-ups 5 and a voided 20; in season bench
 *      100×5 and pull-ups 8; plus a bench 200×5 AFTER the season (in the next season).
 *  B — only a treadmill entry before the season (not a rookie; no test-category baseline);
 *      push-ups in season.
 *  C — nothing before the season (rookie); treadmill in season.
 *  D — only a VOIDED entry before the season (rookie); pull-ups in season.
 */
async function equivFixture() {
  const o = owner();
  try {
    const ids = {} as Record<"A" | "B" | "C" | "D", string>;
    for (const [i, n] of (["A", "B", "C", "D"] as const).entries()) {
      let [m] = await o`select id from public.members where full_name = ${`M4 equiv ${n}`} order by member_code limit 1`;
      if (!m) [m] = await o`insert into public.members (full_name, phone, coach_id) values (${`M4 equiv ${n}`}, ${`+20154655000${i}`}, ${COACH3}::uuid) returning id`;
      ids[n] = m.id as string;
    }
    for (const [name, start, end] of [["M4 equiv baseline", "1655-01-01", "1655-01-28"], ["M4 equiv season", "1655-03-01", "1655-03-28"], ["M4 equiv after", "1655-04-01", "1655-04-28"]] as const) {
      await o`insert into public.seasons (name, type, starts_on, ends_on)
              select ${name}, 'championship', ${start}::date, ${end}::date
              where not exists (select 1 from public.seasons where name = ${name})`;
    }
    const add = async (member: string, category: string, day: string, w: number | null, reps: number | null, km: number | null, voided = false) => {
      await o`insert into public.entries (member_id, season_id, category, performed_on, weight_kg, reps, km, value, logged_by)
              select ${member}::uuid, '00000000-0000-0000-0000-000000000000', ${category}::public.category_code, ${day}::date, ${w}, ${reps}, ${km}, 0, ${COACH3}::uuid
              where not exists (select 1 from public.entries where member_id = ${member}::uuid and category = ${category}::public.category_code and performed_on = ${day}::date)`;
      if (voided) await o`update public.entries set voided_at = now(), voided_by = ${COACH3}::uuid, void_reason = 'M4 equivalence fixture'
                          where member_id = ${member}::uuid and category = ${category}::public.category_code and performed_on = ${day}::date and voided_at is null`;
    };
    await add(ids.A, "bench", "1655-01-05", 100, 3, null);
    await add(ids.A, "bench", "1655-01-06", 95, 5, null);
    await add(ids.A, "bench", "1655-01-07", 120, 5, null, true);
    await add(ids.A, "pullups", "1655-01-05", null, 5, null);
    await add(ids.A, "pullups", "1655-01-06", null, 20, null, true);
    await add(ids.A, "bench", "1655-03-05", 100, 5, null);
    await add(ids.A, "pullups", "1655-03-05", null, 8, null);
    await add(ids.A, "bench", "1655-04-05", 200, 5, null);
    await add(ids.B, "treadmill", "1655-01-05", null, null, 3);
    await add(ids.B, "pushups", "1655-03-05", null, 20, null);
    await add(ids.C, "treadmill", "1655-03-05", null, null, 2);
    await add(ids.D, "pullups", "1655-01-05", null, 9, null, true);
    await add(ids.D, "pullups", "1655-03-06", null, 4, null);
    const [season] = await o`select id, name, type, starts_on::text, ends_on::text from public.seasons where name = 'M4 equiv season'`;
    return { season: season as unknown as { id: string; name: string; type: "championship"; starts_on: string; ends_on: string }, ids };
  } finally {
    await o.end();
  }
}

describe("leaderboard edge-case equivalence (optimized read ≡ M1 full history)", () => {
  it("voided maxima, e1RM ordering, treadmill-only and voided-only history, after-season entries", async () => {
    const { season, ids } = await equivFixture();
    const inputs = await loadSeasonInputs(season);
    const w = { type: season.type, startsOn: season.starts_on, endsOn: season.ends_on };
    const fast = new Map(inputs.participants.map((p) => [p.memberId, scoreMember(memberSeasonValues(p, w))]));
    const fastValues = new Map(inputs.participants.map((p) => [p.memberId, memberSeasonValues(p, w)]));

    // reference: EVERY entry of these members (voided and after-season included — M1 filters)
    const all = Object.values(ids);
    const entries = await fetchAll<EntryRecord>((f, t) =>
      service.from("entries").select("id, member_id, category, performed_on, weight_kg::text, reps, km::text, photo_path, logged_by, created_at, voided_at")
        .in("member_id", all).order("id").range(f, t) as never);
    const att = await fetchAll<AttendanceRecordRow>((f, t) =>
      service.from("attendance").select("member_id, attended_on, voided_at").in("member_id", all).order("id").range(f, t) as never);
    for (const id of all) {
      const p = inputs.participants.find((x) => x.memberId === id)!;
      const full = participantHistory(id, p.plannedSessions, entries.filter((e) => e.member_id === id), att.filter((a) => a.member_id === id));
      const ref = scoreMember(memberSeasonValues({ ...full, isActive: p.isActive }, w));
      const got = fast.get(id)!;
      expect(got.isRookie).toBe(ref.isRookie);
      for (const c of Object.keys(ref.categories) as (keyof typeof ref.categories)[]) expect(got.categories[c].eq(ref.categories[c]), c).toBe(true);
      expect(got.total.eq(ref.total)).toBe(true);
    }
    // and the semantics are the intended ones, not merely equal
    const a = fastValues.get(ids.A)!;
    expect(a.baseline.bench!.toFixed(4)).toBe("110.8333"); // 95×5, not 100×3, never the voided 120×5
    expect(a.baseline.pullups!.toFixed(0)).toBe("5"); // never the voided 20
    expect(a.monthBest.bench!.toFixed(4)).toBe("116.6667"); // the after-season 200×5 is ignored
    expect(fastValues.get(ids.B)!).toMatchObject({ isRookie: false });
    expect(fastValues.get(ids.B)!.baseline).toEqual({});
    expect(fastValues.get(ids.C)!.isRookie).toBe(true);
    expect(fastValues.get(ids.D)!.isRookie).toBe(true); // a voided entry is no history
  });
});

/**
 * K1 closed-season fixture (tests/FIXTURES.md, reserved year 1656). Members `M4 frozen A–D`
 * (coach 3) are created before two seasons; A–C get a pull-ups baseline in "M4 frozen
 * baseline" (1656-01); in "M4 frozen season" (1656-03) A runs 3 km, B and C 2 km each (a tie),
 * D (no baseline → rookie) 1 km. The season is then closed ONCE through the real close
 * contract (closer role, begin_season_close → finish_season_close) with results computed by
 * the M1 scoring module, as the close operation does (D21). After the close, B is deactivated
 * once — a post-closure status change that must not alter the final standings.
 */
async function frozenFixture() {
  const o = owner();
  try {
    const ids = {} as Record<"A" | "B" | "C" | "D", string>;
    for (const [i, n] of (["A", "B", "C", "D"] as const).entries()) {
      let [m] = await o`select id from public.members where full_name = ${`M4 frozen ${n}`} order by member_code limit 1`;
      if (!m) [m] = await o`insert into public.members (full_name, phone, coach_id) values (${`M4 frozen ${n}`}, ${`+20154656000${i}`}, ${COACH3}::uuid) returning id`;
      ids[n] = m.id as string;
    }
    for (const [name, start, end] of [["M4 frozen baseline", "1656-01-01", "1656-01-28"], ["M4 frozen season", "1656-03-01", "1656-03-28"]] as const) {
      await o`insert into public.seasons (name, type, starts_on, ends_on)
              select ${name}, 'championship', ${start}::date, ${end}::date
              where not exists (select 1 from public.seasons where name = ${name})`;
    }
    const [season] = await o`select id, name, type, starts_on::text, ends_on::text, closed_at from public.seasons where name = 'M4 frozen season'`;
    if (!season.closed_at) {
      const add = (member: string, category: string, day: string, reps: number | null, km: number | null) =>
        o`insert into public.entries (member_id, season_id, category, performed_on, reps, km, value, logged_by)
          select ${member}::uuid, '00000000-0000-0000-0000-000000000000', ${category}::public.category_code, ${day}::date, ${reps}, ${km}, 0, ${COACH3}::uuid
          where not exists (select 1 from public.entries where member_id = ${member}::uuid and category = ${category}::public.category_code and performed_on = ${day}::date)`;
      for (const n of ["A", "B", "C"] as const) await add(ids[n], "pullups", "1656-01-10", 5, null);
      await add(ids.A, "treadmill", "1656-03-05", null, 3);
      await add(ids.B, "treadmill", "1656-03-06", null, 2);
      await add(ids.C, "treadmill", "1656-03-07", null, 2);
      await add(ids.D, "treadmill", "1656-03-08", null, 1);
      // results exactly as the close operation computes them: modules/scoring, every participant
      const board = { id: season.id as string, name: season.name as string, type: "championship" as const, starts_on: season.starts_on as string, ends_on: season.ends_on as string };
      const standings = rankParticipants(board, (await loadSeasonInputs(board)).participants);
      const n4 = (r: { toFixed(d: number): string }) => Number(r.toFixed(4));
      const row = (r: (typeof standings.main)[number] | (typeof standings.unranked)[number], rank: number | null, rookieRank: number | null) => ({
        member_id: r.memberId, is_rookie: r.isRookie,
        deadlift: n4(r.categories.deadlift), bench: n4(r.categories.bench), squat: n4(r.categories.squat),
        pullups: n4(r.categories.pullups), pushups: n4(r.categories.pushups), treadmill: n4(r.categories.treadmill),
        consistency: n4(r.categories.consistency), improvement_points: n4(r.improvementPoints), total: n4(r.total),
        rank, rookie_rank: rookieRank,
      });
      const results = [
        ...standings.main.map((r) => row(r, r.rank, null)),
        ...standings.rookies.map((r) => row(r, null, r.rank)),
        ...standings.unranked.map((r) => row(r, null, null)),
      ];
      const closer = await closerConnection(1);
      try {
        await closer.begin(async (tx) => {
          await tx`select public.begin_season_close(${season.id}, ${ADMIN})`;
          await tx`select public.finish_season_close(${season.id}, ${tx.json(results as never)})`;
        });
      } finally {
        await closer.end();
      }
    }
    // post-closure change (once): B, ranked at close, is deactivated afterwards
    await o`update public.members set status = 'inactive' where id = ${ids.B}::uuid and status = 'active'`;
    return { seasonId: season.id as string, ids };
  } finally {
    await o.end();
  }
}

describe("K1: a closed season shows its frozen final results", () => {
  it("frozen ranks and totals exactly; a post-closure deactivation changes nothing; never live", async () => {
    const { seasonId, ids } = await frozenFixture();
    const o = owner();
    const frozen = await o`select member_id, rank, rookie_rank, total::text, member_active from public.season_results where season_id = ${seasonId}`;
    const [season] = await o`select id, name, type, starts_on::text, ends_on::text, closed_at from public.seasons where id = ${seasonId}`;
    const [b] = await o`select status from public.members where id = ${ids.B}::uuid`;
    await o.end();
    expect(season.closed_at).not.toBeNull();
    expect(b.status).toBe("inactive"); // the post-closure change really happened

    const r = await getLeaderboard(admin, { id: "admin", role: "admin" }, seasonId, today());
    type Row = { member_id: string; rank: number; total: number };
    const board = (r as unknown as { data: { final: boolean; main: Row[]; rookies: Row[] } }).data;
    expect(board.final).toBe(true);
    const key = (rows: Row[]) => rows.map((x) => `${x.member_id}:${x.rank}`).sort();
    const exp = (col: "rank" | "rookie_rank") => frozen.filter((f) => f[col] !== null).map((f) => `${f.member_id}:${f[col]}`).sort();
    expect(key(board.main)).toEqual(exp("rank"));
    expect(key(board.rookies)).toEqual(exp("rookie_rank"));
    for (const x of board.main) expect(x.total).toBe(Number(Number(frozen.find((f) => f.member_id === x.member_id)!.total).toFixed(2)));
    for (let i = 1; i < board.main.length; i++) expect(board.main[i].rank).toBeGreaterThanOrEqual(board.main[i - 1].rank);
    // the fixture's own story: A first, B and C share second — B although inactive NOW
    const row = (id: string) => board.main.find((x) => x.member_id === id);
    expect(row(ids.A)?.rank).toBe(1);
    expect(row(ids.B)?.rank).toBe(2);
    expect(row(ids.C)?.rank).toBe(2);
    expect(board.rookies.find((x) => x.member_id === ids.D)).toBeTruthy();
    // proof it is not a live recomputation: recomputing today would drop B
    const live = rankParticipants(season as never, (await loadSeasonInputs(season as never)).participants);
    expect(live.main.some((x) => x.memberId === ids.B)).toBe(false);
    // members inactive AT close stay off the board (D29)
    const offAtClose = new Set(frozen.filter((f) => !f.member_active).map((f) => f.member_id as string));
    for (const x of [...board.main, ...board.rookies]) expect(offAtClose.has(x.member_id)).toBe(false);
  });

  it("a coach gets the frozen board with the same privacy rules (no other coaches' ids or photos)", async () => {
    const { seasonId } = await frozenFixture();
    const r = await getLeaderboard(coach1, { id: COACH1, role: "coach" }, seasonId, today());
    type Row = { member_id: string | null; own: boolean; photo_url: string | null };
    const board = (r as unknown as { data: { final: boolean; main: Row[]; rookies: Row[] } }).data;
    expect(board.final).toBe(true);
    for (const x of [...board.main, ...board.rookies]) {
      if (!x.own) expect(x.member_id).toBeNull();
      if (!x.own) expect(x.photo_url).toBeNull();
    }
    expect(JSON.stringify(board)).not.toMatch(/\+20\d{9}|GA-\d{6}|photo_path|baseline_json|month_best/);
  });

  it("the open (active) season is still live, not final", async () => {
    const r = await getLeaderboard(admin, { id: "admin", role: "admin" }, ACTIVE_SEASON, today());
    expect((r as unknown as { data: { final: boolean } }).data.final).toBe(false);
  });
});

describe("leaderboard security", () => {
  it("a coach gets the GLOBAL board, but other coaches' members carry no id and no private data", async () => {
    const asAdmin = await getLeaderboard(admin, { id: "admin", role: "admin" }, ACTIVE_SEASON, today());
    const asCoach = await getLeaderboard(coach1, { id: COACH1, role: "coach" }, ACTIVE_SEASON, today());
    expect(asAdmin.ok && asCoach.ok).toBe(true);
    const a = (asAdmin as { data: { main: unknown[]; rookies: unknown[] } }).data;
    const c = (asCoach as unknown as { data: { main: Record<string, unknown>[]; rookies: Record<string, unknown>[] } }).data;
    expect(c.main.length).toBe(a.main.length); // the same global ranking
    expect(c.rookies.length).toBe(a.rookies.length);
    const o = owner();
    const mine = new Set((await o`select id from public.members where coach_id = ${COACH1}::uuid`).map((m) => m.id as string));
    await o.end();
    for (const row of [...c.main, ...c.rookies]) {
      expect(Object.keys(row).sort()).toEqual(["categories", "coach_name", "full_name", "improvement_points", "is_rookie", "own", "photo_url", "rank", "total", "total_display", "member_id"].sort());
      if (row.own) expect(mine.has(row.member_id as string)).toBe(true);
      else expect(row.member_id).toBeNull();
    }
    const json = JSON.stringify(c);
    expect(json).not.toMatch(/\+20\d{9}|GA-\d{6}|photo_path|entries\/|weight_kg/);
  });

  it("regression (audit): no other coach's member id appears ANYWHERE in a coach's board — photo URLs included", async () => {
    // the precondition is built here, not borrowed from rows other runs left behind
    const photo = await photoFixture();
    const o0 = owner();
    const [meta] = await o0`select m.coach_id, m.photo_consent, m.photo_path, m.status,
                              exists (select 1 from public.season_participants sp where sp.member_id = m.id and sp.season_id = ${ACTIVE_SEASON}) as enrolled
                            from public.members m where m.id = ${photo.id}`;
    await o0.end();
    expect(meta).toMatchObject({ coach_id: COACH2, photo_consent: true, photo_path: photo.path, status: "active", enrolled: true });
    const listed = await service.storage.from("avatars").list(`members/${photo.id}`);
    expect((listed.data ?? []).map((f) => `members/${photo.id}/${f.name}`)).toContain(photo.path);
    // storage privacy: the owning coach can read the object, another coach cannot
    const coach2 = await signIn("coach2@gym-arena.local");
    expect((await coach2.storage.from("avatars").download(photo.path)).error).toBeNull();
    const peek = await coach1.storage.from("avatars").download(photo.path);
    expect(peek.data).toBeNull();
    expect(peek.error).not.toBeNull();

    const asAdmin = await getLeaderboard(admin, { id: "admin", role: "admin" }, ACTIVE_SEASON, today());
    const asCoach = await getLeaderboard(coach1, { id: COACH1, role: "coach" }, ACTIVE_SEASON, today());
    type R = { member_id: string | null; own: boolean; photo_url: string | null };
    const a = (asAdmin as unknown as { data: { main: R[]; rookies: R[] } }).data;
    const c = (asCoach as unknown as { data: { main: R[]; rookies: R[] } }).data;
    const o = owner();
    const mine = new Set((await o`select id from public.members where coach_id = ${COACH1}::uuid`).map((m) => m.id as string));
    await o.end();
    const others = [...a.main, ...a.rookies].map((r) => r.member_id!).filter((id) => !mine.has(id));
    // precondition that makes this test meaningful: signed avatar URLs embed the member id
    // (storage path members/<member_id>/…), and the admin board has such URLs for others
    const otherPhotos = [...a.main, ...a.rookies].filter((r) => r.photo_url && !mine.has(r.member_id!));
    expect(otherPhotos.length).toBeGreaterThan(0);
    expect(otherPhotos.some((r) => decodeURIComponent(r.photo_url!).includes(r.member_id!))).toBe(true);
    expect(otherPhotos.some((r) => r.member_id === photo.id)).toBe(true); // the fixture is among them

    const json = decodeURIComponent(JSON.stringify(c));
    for (const id of others) expect(json.includes(id), `leaked ${id.slice(0, 8)}…`).toBe(false);
    for (const r of [...c.main, ...c.rookies]) if (!r.own) expect(r.photo_url).toBeNull();
    // own clients keep their consented photos
    const ownPhotos = [...a.main, ...a.rookies].filter((r) => r.photo_url && mine.has(r.member_id!)).length;
    expect([...c.main, ...c.rookies].filter((r) => r.own && r.photo_url).length).toBe(ownPhotos);
  });

  it("photos only with consent (BR-P8)", async () => {
    const r = await getLeaderboard(admin, { id: "admin", role: "admin" }, ACTIVE_SEASON, today());
    const rows = (r as { data: { main: { member_id: string; photo_url: string | null }[]; rookies: { member_id: string; photo_url: string | null }[] } }).data;
    const o = owner();
    const noConsent = new Set((await o`select id from public.members where photo_consent = false`).map((m) => m.id as string));
    await o.end();
    for (const x of [...rows.main, ...rows.rookies]) if (noConsent.has(x.member_id)) expect(x.photo_url).toBeNull();
  });

  it("unknown or invisible seasons are refused; an inactive coach sees none", async () => {
    const missing = await getLeaderboard(admin, { id: "admin", role: "admin" }, "11111111-1111-4111-8111-111111111111", today());
    expect(missing).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const inactive = await inactiveProbeCoach();
    const r = await getLeaderboard(inactive, { id: "x", role: "coach" }, ACTIVE_SEASON, today());
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" }); // seasons are not visible to an inactive coach
  });

  it("the baseline function cannot be called by a coach or anonymously", async () => {
    for (const client of [coach1, anon()]) {
      const r = await client.rpc("leaderboard_baselines", { p_season_id: ACTIVE_SEASON });
      expect(r.error?.message ?? "").toMatch(/permission denied/);
      expect(r.data ?? null).toBeNull();
    }
  });
});

describe("leaderboard scale", () => {
  it(`ranks a season of > 1000 participants for a coach within the budget`, async () => {
    const { season } = await scaleFixture(); // realistic scale, built by this test (reserved year 1657)
    await getLeaderboard(coach1, { id: COACH1, role: "coach" }, season.id, today()); // warm up
    const started = performance.now();
    const r = await getLeaderboard(coach1, { id: COACH1, role: "coach" }, season.id, today());
    const elapsed = performance.now() - started;
    const board = (r as { data: { main: unknown[]; rookies: unknown[] } }).data;
    expect(board.main.length + board.rookies.length).toBeGreaterThan(1000);
    // measured ~0.3–0.6 s at this scale (M4 report); 3 s keeps CI headroom and is far below the
    // 8 s statement timeout that the reads would hit if they regressed to per-row policies
    expect(elapsed).toBeLessThan(3_000);
    console.info(`[perf] coach leaderboard: ${Math.round(elapsed)} ms for ${board.main.length + board.rookies.length} rows`);
  }, 120_000);
});
