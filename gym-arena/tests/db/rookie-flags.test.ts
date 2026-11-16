/**
 * Regression: rookie flags on the Members list (M2) with more than 1000 pre-season entries.
 *
 * The flag (SCORING §1: no non-voided entry before the season start) used to be computed
 * from ONE request for every pre-season entry. The API returns at most max_rows (1000) rows,
 * so on a busy database members whose baseline rows fell past the limit were wrongly shown
 * as rookies. listMembers now reads every page. This test builds that state for real.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { today } from "@/lib/time";
import { owner, signIn } from "./helpers";

vi.mock("server-only", () => ({})); // trusted server-side caller
const { listMembers } = await import("@/modules/members/service");

const COACH3 = "00000000-0000-4000-a000-000000000013"; // keeps these rows out of the other suites' coach lists
const API_MAX_ROWS = 1000;
const FIXTURE_MEMBERS = 200; // × 6 categories = 1200 pre-season entries on their own

let admin: SupabaseClient;
let fixtureIds: string[] = [];
let activeStart: string;

/**
 * Fixture (documented in tests/FIXTURES.md). Permanent, idempotent and isolated:
 * - members of coach 3 named "Rookie fixture …", phones +2015…, each with one baseline
 *   entry per category on 1651-01-10 in the far-past season "Rookie flag fixture";
 * - the fixture SET is always the same: the first 200 such members by member code that
 *   already have their baselines; only the missing ones are created (none on a stack that
 *   has them), so reruns never add rows;
 * - "Rookie fixture fresh" (no pre-season entries) is reused the same way.
 * Rows can never be deleted (BR-E8), so the fixture is never torn down.
 */
async function ensureFixture(o: ReturnType<typeof owner>) {
  await o`insert into public.seasons (name, type, starts_on, ends_on)
          select 'Rookie flag fixture', 'championship', '1651-01-01', '1651-01-28'
          where not exists (select 1 from public.seasons where name = 'Rookie flag fixture')`;
  const ready = async () =>
    (await o`select m.id from public.members m
             where m.coach_id = ${COACH3}::uuid and m.full_name like 'Rookie fixture %' and m.full_name <> 'Rookie fixture fresh'
               and (select count(*) from public.entries e where e.member_id = m.id and e.performed_on = '1651-01-10') = 6
             order by m.member_code limit ${FIXTURE_MEMBERS}`).map((r) => r.id as string);
  let ids = await ready();
  const missing = FIXTURE_MEMBERS - ids.length;
  if (missing > 0) {
    const base = 10_000_000 + Math.floor(Math.random() * 80_000_000);
    const created = await o`
      insert into public.members (full_name, phone, coach_id)
      select 'Rookie fixture ' || g, '+2015' || lpad((${base} + g)::text, 8, '0'), ${COACH3}::uuid
      from generate_series(1, ${missing}) g
      returning id`;
    // one entry per category per member (owner session: the triggers still validate shape,
    // season and status and compute the value)
    await o`
      insert into public.entries (member_id, season_id, category, performed_on, weight_kg, reps, km, value, logged_by)
      select m.id, '00000000-0000-0000-0000-000000000000', c.cat::public.category_code, '1651-01-10',
             case when c.cat in ('deadlift','bench','squat') then 60 end,
             case when c.cat in ('deadlift','bench','squat') then 5 when c.cat = 'pullups' then 5 when c.cat = 'pushups' then 20 end,
             case when c.cat = 'treadmill' then 2 end,
             0, ${COACH3}::uuid
      from unnest(${created.map((m) => m.id as string)}::uuid[]) as m(id)
      cross join unnest(array['deadlift','bench','squat','pullups','pushups','treadmill']) as c(cat)`;
    ids = await ready();
  }
  let [fresh] = await o`select m.id from public.members m
                        where m.coach_id = ${COACH3}::uuid and m.full_name = 'Rookie fixture fresh'
                          and not exists (select 1 from public.entries e where e.member_id = m.id)
                        order by m.member_code limit 1`;
  if (!fresh) {
    [fresh] = await o`insert into public.members (full_name, phone, coach_id)
      values ('Rookie fixture fresh', '+2015' || lpad((${Date.now() % 90_000_000} + 9)::text, 8, '0'), ${COACH3}::uuid) returning id`;
  }
  return { ids, freshId: fresh.id as string };
}

let freshId: string;

beforeAll(async () => {
  admin = await signIn("admin@gym-arena.local");
  const o = owner();
  try {
    ({ ids: fixtureIds, freshId } = await ensureFixture(o));
    const [s] = await o`select starts_on::text as d from public.seasons where closed_at is null and starts_on <= ${today()}::date and ends_on >= ${today()}::date`;
    activeStart = s.d;
  } finally {
    await o.end();
  }
}, 120_000);

describe("rookie flags with more pre-season entries than the API returns", () => {
  it("precondition: more pre-season entries exist than one request returns", async () => {
    const naive = await admin.from("entries").select("member_id").lt("performed_on", activeStart);
    expect(naive.error).toBeNull();
    expect(naive.data!.length).toBe(API_MAX_ROWS);
    const o = owner();
    const [{ n }] = await o`select count(*)::int as n from public.entries where performed_on < ${activeStart}::date`;
    await o.end();
    expect(n).toBeGreaterThan(API_MAX_ROWS);
    // Which rows a truncated request drops depends on the database's (undefined) row order,
    // so whether the old code mislabelled a given member was luck; the fix removes the luck.
  });

  it("the fixture is stable: exactly the same 200 members on every run", async () => {
    expect(fixtureIds).toHaveLength(FIXTURE_MEMBERS);
    const o = owner();
    try {
      const again = await ensureFixture(o); // a second call must create nothing
      expect(again.ids).toEqual(fixtureIds);
      expect(again.freshId).toBe(freshId);
    } finally {
      await o.end();
    }
  });

  it("listMembers reads every page: no fixture member with a baseline is a rookie", async () => {
    const list = await listMembers(admin, { coach_id: COACH3, status: "active" }, today());
    const byId = new Map(list.map((m) => [m.id, m]));
    for (const id of fixtureIds) expect(byId.get(id)?.is_rookie, id).toBe(false);
  });

  it("a member with no pre-season entry is still a rookie; the coach view agrees", async () => {
    const m = { id: freshId };
    const list = await listMembers(admin, { coach_id: COACH3, status: "active" }, today());
    expect(list.find((x) => x.id === m.id)?.is_rookie).toBe(true);
    const coach3 = await signIn("coach3@gym-arena.local");
    const own = await listMembers(coach3, { status: "active" }, today());
    expect(own.find((x) => x.id === m.id)?.is_rookie).toBe(true);
    expect(own.filter((x) => fixtureIds.includes(x.id)).every((x) => x.is_rookie === false)).toBe(true);
  });

  it("skipping the rookie read (coach Today computes it from the full history) leaves the flag unset", async () => {
    const list = await listMembers(admin, { coach_id: COACH3, status: "active" }, today(), { rookies: false });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m) => m.is_rookie === null)).toBe(true);
  });
});
