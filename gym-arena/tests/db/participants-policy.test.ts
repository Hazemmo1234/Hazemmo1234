/**
 * Seasons performance + participant isolation (migration 20261116000002).
 *
 * participants_select used to run two non-inlinable SECURITY DEFINER functions per
 * participant row, so a coach's Seasons list (participant count per season) took ~11 s at
 * test-stack scale and hit the 8 s statement timeout. The policy is now evaluated set-based
 * (one InitPlan + one hashed subplan) with exactly the same access rule. These tests prove:
 * the counts are exact, coaches stay isolated, the policy cannot silently regress to the
 * per-row form, and the coach's real (RLS) path is fast at scale.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { today } from "@/lib/time";
import { COACH1, COACH2, anon, inactiveProbeCoach, owner, signIn } from "./helpers";

vi.mock("server-only", () => ({})); // the service is server-only; this test is a trusted server-side caller
const { listSeasons } = await import("@/modules/seasons/service");

const COACH3 = "00000000-0000-4000-a000-000000000013";
/** At least the scale that exposed the problem (tests/FIXTURES.md → "Seasons scale fixture"). */
const SCALE = { seasons: 136, participants: 74_000 };
/**
 * Coach list budget through PostgREST + RLS, end to end. The fixed policy measures tens of
 * milliseconds at this scale (see the M3 report); 2 s leaves room for a slow CI machine and
 * is still 4× below the 8 s statement timeout and ~5× below the old 11 s, so a return to the
 * per-row policy fails this test. The plan-shape test below is the environment-independent guard.
 */
const COACH_LIST_BUDGET_MS = 2_000;

let admin: SupabaseClient, coach1: SupabaseClient, coach2: SupabaseClient;

/** Idempotent: reaches the scale with far-past seasons and fixture members only when missing. */
async function ensureScale() {
  const o = owner();
  try {
    const count = async () => (await o`select (select count(*)::int from public.seasons) as s, (select count(*)::int from public.season_participants) as p`)[0];
    let c = await count();
    if (c.p >= SCALE.participants && c.s >= SCALE.seasons) return c;
    // members first (a new season enrols every active member): spread over coaches 2 and 3
    const [{ n: active }] = await o`select count(*)::int as n from public.members where status = 'active'`;
    const wanted = Math.max(0, 600 - active);
    if (wanted > 0) {
      const base = 10_000_000 + Math.floor(Math.random() * 80_000_000);
      await o`insert into public.members (full_name, phone, coach_id)
              select 'Scale fixture ' || g, '+2012' || lpad((${base} + g)::text, 8, '0'),
                     case when g % 2 = 0 then ${COACH2}::uuid else ${COACH3}::uuid end
              from generate_series(1, ${wanted}) g`;
    }
    // then one far-past season per month (reserved years 1660+) until the scale is reached
    for (let i = 0; (c.p < SCALE.participants || c.s < SCALE.seasons) && i < 2000; i++) {
      const year = 1660 + Math.floor(i / 12), month = String((i % 12) + 1).padStart(2, "0");
      await o`insert into public.seasons (name, type, starts_on, ends_on)
              select ${`Scale fixture ${year}-${month}`}, 'championship', ${`${year}-${month}-01`}::date, ${`${year}-${month}-28`}::date
              where not exists (select 1 from public.seasons where name = ${`Scale fixture ${year}-${month}`})`;
      c = await count();
    }
    return c;
  } finally {
    await o.end();
  }
}

/** Ground truth as the database owner (no RLS): participant count per season, optionally for one coach. */
async function truth(coachId?: string): Promise<Map<string, number>> {
  const o = owner();
  try {
    const rows = coachId
      ? await o`select s.id, (select count(*)::int from public.season_participants sp join public.members m on m.id = sp.member_id
                              where sp.season_id = s.id and m.coach_id = ${coachId}::uuid) as n from public.seasons s`
      : await o`select s.id, (select count(*)::int from public.season_participants sp where sp.season_id = s.id) as n from public.seasons s`;
    return new Map(rows.map((r) => [r.id as string, r.n as number]));
  } finally {
    await o.end();
  }
}

/** The plan PostgreSQL chooses for the coach's count query under the coach's own RLS context. */
async function coachPlan(coachId: string, analyze: boolean): Promise<string> {
  const o = owner();
  try {
    return await o.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: coachId, role: "authenticated" })}, true)`;
      const rows = await tx.unsafe(`explain (${analyze ? "analyze, timing off, summary on, " : ""}costs off)
        select s.id, c.n from public.seasons s
        left join lateral (select count(*) as n from public.season_participants sp where sp.season_id = s.id) c on true
        order by s.starts_on desc`);
      return rows.map((r) => r["QUERY PLAN"] as string).join("\n");
    });
  } finally {
    await o.end();
  }
}

beforeAll(async () => {
  const scale = await ensureScale();
  expect(scale.p).toBeGreaterThanOrEqual(SCALE.participants);
  expect(scale.s).toBeGreaterThanOrEqual(SCALE.seasons);
  [admin, coach1, coach2] = await Promise.all([signIn("admin@gym-arena.local"), signIn("coach1@gym-arena.local"), signIn("coach2@gym-arena.local")]);
}, 600_000);

describe("participants_select is set-based and keeps the same access rule", () => {
  it("the installed policy evaluates once per query (InitPlan + hashed subplan), not per row", async () => {
    const o = owner();
    const [p] = await o`select pg_get_expr(polqual, polrelid) as qual from pg_policy where polname = 'participants_select' and polrelid = 'public.season_participants'::regclass`;
    const [g] = await o`select has_function_privilege('anon', 'public.own_member_ids()', 'execute') as anon,
                               has_function_privilege('authenticated', 'public.own_member_ids()', 'execute') as auth`;
    await o.end();
    expect(p.qual).toMatch(/\(\s*SELECT is_admin\(\)/); // deparsed as "( SELECT is_admin() AS is_admin)"
    expect(p.qual).toMatch(/member_id IN \(\s*SELECT own_member_ids\(\)/);
    expect(p.qual).not.toMatch(/is_own_member/);
    expect(g).toEqual({ anon: false, auth: true });

    const plan = await coachPlan(COACH1, false);
    expect(plan).toMatch(/hashed SubPlan/);
    expect(plan).not.toMatch(/is_own_member/);
  });

  it("admin: every season's count is exact", async () => {
    const t = await truth();
    const seasons = await listSeasons(admin, today());
    expect(seasons.length).toBe(t.size);
    for (const s of seasons) expect(s.participants, s.name).toBe(t.get(s.id));
  });

  it("coach A and coach B each count only their own members — exactly", async () => {
    for (const [client, coachId] of [[coach1, COACH1], [coach2, COACH2]] as const) {
      const t = await truth(coachId);
      const seasons = await listSeasons(client, today());
      expect(seasons.length).toBe(t.size);
      for (const s of seasons) expect(s.participants, `${coachId} ${s.name}`).toBe(t.get(s.id));
    }
  });

  it("isolation: rows a coach can read are only their own members'; another coach's are invisible", async () => {
    const o = owner();
    const [c2member] = await o`select id from public.members where coach_id = ${COACH2}::uuid and status = 'active' order by member_code limit 1`;
    const [season] = await o`select season_id from public.season_participants where member_id = ${c2member.id} limit 1`;
    await o.end();
    // a direct read of coach 2's member's participation, as coach 1 → nothing
    const peek = await coach1.from("season_participants").select("member_id").eq("member_id", c2member.id);
    expect(peek.error).toBeNull();
    expect(peek.data).toEqual([]);
    // coach 2 sees it
    const own = await coach2.from("season_participants").select("member_id").eq("member_id", c2member.id).eq("season_id", season.season_id);
    expect(own.data).toEqual([{ member_id: c2member.id }]);
    // everything coach 1 can read in that season belongs to coach 1
    const { data: rows } = await coach1.from("season_participants").select("member_id").eq("season_id", season.season_id);
    const ids = (rows ?? []).map((r) => r.member_id as string);
    const o2 = owner();
    const [{ n }] = await o2`select count(*)::int as n from public.members where id = any(${ids}::uuid[]) and coach_id <> ${COACH1}::uuid`;
    await o2.end();
    expect(ids.length).toBeGreaterThan(0);
    expect(n).toBe(0);
  });

  it("an inactive coach and a signed-out caller read nothing", async () => {
    const inactive = await inactiveProbeCoach(); // tests/FIXTURES.md
    const r = await inactive.from("season_participants").select("member_id").limit(5);
    expect(r.data ?? []).toEqual([]);
    const a = await anon().from("season_participants").select("member_id").limit(5);
    expect(a.data ?? []).toEqual([]);
    await expect(listSeasons(anon(), today())).rejects.toThrow();
  });

  it(`performance: the coach's Seasons list at ≥ ${SCALE.participants} rows stays within ${COACH_LIST_BUDGET_MS} ms`, async () => {
    await listSeasons(coach1, today()); // warm the connection and caches once
    const started = performance.now();
    const seasons = await listSeasons(coach1, today());
    const elapsed = performance.now() - started;
    expect(seasons.length).toBeGreaterThanOrEqual(SCALE.seasons);
    expect(elapsed).toBeLessThan(COACH_LIST_BUDGET_MS);
    const plan = await coachPlan(COACH1, true);
    const ms = Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1]);
    expect(ms).toBeLessThan(COACH_LIST_BUDGET_MS);
  });
});
