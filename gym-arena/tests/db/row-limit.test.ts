/**
 * Regression: lists that must never be cut at the API row limit (max_rows = 1000).
 *
 * Once the members table passed 1000 rows, the admin Members list (and /api/members) and the
 * Coaches list's "active clients" counts were each read with ONE request and silently lost
 * the rows past the limit: members disappeared from the list, and a coach with clients could
 * show 0 (so the "can't deactivate yet" explanation did not appear — the database rule BR-P7
 * still held). Both now read every page. The admin dashboard's "results today" and
 * "coaches who logged today" had the same cap on a busy day (> 1000 results).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { today } from "@/lib/time";
import { owner, signIn } from "./helpers";

vi.mock("server-only", () => ({})); // trusted server-side caller
const { listMembers } = await import("@/modules/members/service");
const { listCoaches } = await import("@/modules/coaches/service");
const { getAdminOverview } = await import("@/modules/dashboard/overview");

const COACH3 = "00000000-0000-4000-a000-000000000013";
const LIMIT = 1000;
let admin: SupabaseClient;
let total = 0;

beforeAll(async () => {
  const o = owner();
  try {
    // idempotent: tops the table up past the limit only when a stack is below it (tests/FIXTURES.md)
    let [{ n }] = await o`select count(*)::int as n from public.members where status = 'active'`;
    if (n <= LIMIT) {
      const base = 10_000_000 + Math.floor(Math.random() * 80_000_000);
      await o`insert into public.members (full_name, phone, coach_id)
              select 'Scale fixture ' || g, '+2012' || lpad((${base} + g)::text, 8, '0'), ${COACH3}::uuid
              from generate_series(1, ${LIMIT + 1 - n}) g`;
      [{ n }] = await o`select count(*)::int as n from public.members where status = 'active'`;
    }
    [{ n: total }] = await o`select count(*)::int as n from public.members`;
    expect(n).toBeGreaterThan(LIMIT);
  } finally {
    await o.end();
  }
  admin = await signIn("admin@gym-arena.local");
}, 300_000);

describe("lists are never cut at the API row limit", () => {
  it("precondition: one plain request returns only the first 1000 members", async () => {
    const r = await admin.from("members").select("id");
    expect(r.data!.length).toBe(LIMIT);
    expect(total).toBeGreaterThan(LIMIT);
  });

  it("listMembers returns every member, each exactly once", async () => {
    const list = await listMembers(admin, {}, today(), { rookies: false });
    expect(list.length).toBe(total);
    expect(new Set(list.map((m) => m.id)).size).toBe(total);
    const active = await listMembers(admin, { status: "active" }, today(), { rookies: false });
    const o = owner();
    const [{ n }] = await o`select count(*)::int as n from public.members where status = 'active'`;
    await o.end();
    expect(active.length).toBe(n);
  });

  it("listCoaches counts every active client of every coach", async () => {
    const o = owner();
    const rows = await o`select coach_id, count(*)::int as n from public.members where status = 'active' group by coach_id`;
    await o.end();
    const truth = new Map(rows.map((r) => [r.coach_id as string, r.n as number]));
    const coaches = await listCoaches(admin);
    expect(coaches.length).toBeGreaterThan(0);
    for (const c of coaches) expect(c.active_clients, c.full_name).toBe(truth.get(c.id) ?? 0);
  });
});

describe("admin dashboard on a day with more than 1000 results", () => {
  it("counts every result today and every coach who logged one", async () => {
    const o = owner();
    try {
      // A DEDICATED pool of coach 3 clients ("Today fixture NNNN") large enough to exceed the
      // limit with three results each — counted on its own, so it never depends on how many
      // other members exist or which test files ran first (tests/FIXTURES.md).
      const POOL = Math.ceil((LIMIT + 1) / 3) + 1;
      const [{ top, have }] = await o`select coalesce(max(substring(full_name from 15)::int), 0) as top, count(*)::int as have
                                      from public.members where full_name like 'Today fixture %'`;
      if (have < POOL) {
        await o`insert into public.members (full_name, phone, coach_id)
                select 'Today fixture ' || lpad(g::text, 4, '0'), '+20154659' || lpad(g::text, 4, '0'), ${COACH3}::uuid
                from generate_series(${top + 1}::int, ${top + POOL - have}::int) g`;
      }
      // idempotent per day: tops today's results up past the limit with that pool (pull-ups,
      // push-ups, deadlift; logged by coach 3) only when today is at or below it
      const [{ n }] = await o`select count(*)::int as n from public.entries where performed_on = public.app_today() and voided_at is null`;
      if (n <= LIMIT) {
        await o`insert into public.entries (member_id, season_id, category, performed_on, weight_kg, reps, value, logged_by)
                select m.id, '00000000-0000-0000-0000-000000000000', c.cat::public.category_code, public.app_today(), c.w, c.r, 0, ${COACH3}::uuid
                from (select id, member_code from public.members
                      where coach_id = ${COACH3}::uuid and status = 'active' and full_name like 'Today fixture %') m
                cross join (values ('pullups', null::numeric, 5), ('pushups', null::numeric, 20), ('deadlift', 60::numeric, 5)) as c(cat, w, r)
                where not exists (select 1 from public.entries e where e.member_id = m.id and e.category = c.cat::public.category_code
                                  and e.performed_on = public.app_today() and e.voided_at is null)
                order by m.member_code, c.cat
                limit ${LIMIT + 1 - n}`;
      }
      const [truth] = await o`select count(*)::int as n,
          (select count(distinct e.logged_by)::int from public.entries e join public.profiles p on p.id = e.logged_by
           where e.performed_on = public.app_today() and e.voided_at is null and p.role = 'coach' and p.is_active) as coaches
        from public.entries where performed_on = public.app_today() and voided_at is null`;
      expect(truth.n).toBeGreaterThan(LIMIT);
      const overview = await getAdminOverview(admin);
      expect(overview.entriesToday).toBe(truth.n);
      expect(overview.coachesLoggedToday).toBe(truth.coaches);
    } finally {
      await o.end();
    }
  });
});
