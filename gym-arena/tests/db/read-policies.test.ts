/**
 * Member-scoped READ policies are set-based (migration 20261116000003) with the same rule:
 * entries_select, attendance_select, coach_assignments_select.
 *
 * They used to call two non-inlinable SECURITY DEFINER functions per row, so every coach
 * screen that reads a client's history (Today, member card, preview/save, activity log) got
 * slower with every result ever logged. These tests prove the rule is unchanged (exact counts,
 * isolation, inactive and signed-out callers) and that it can no longer regress to per-row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { COACH1, COACH2, anon, inactiveProbeCoach, owner, signIn } from "./helpers";

const TABLES = [
  { table: "entries", policy: "entries_select" },
  { table: "attendance", policy: "attendance_select" },
  { table: "coach_assignments", policy: "coach_assignments_select" },
] as const;

let admin: SupabaseClient, coach1: SupabaseClient, coach2: SupabaseClient;

async function truth(table: string, coachId?: string): Promise<number> {
  const o = owner();
  try {
    const [r] = coachId
      ? await o.unsafe(`select count(*)::int as n from public.${table} t join public.members m on m.id = t.member_id where m.coach_id = $1`, [coachId])
      : await o.unsafe(`select count(*)::int as n from public.${table}`);
    return r.n as number;
  } finally {
    await o.end();
  }
}
const visible = async (client: SupabaseClient, table: string) => {
  const { count, error } = await client.from(table).select("member_id", { count: "exact", head: true });
  expect(error).toBeNull();
  return count ?? 0;
};

/** EXPLAIN under the coach's own authenticated RLS context. */
async function coachPlan(table: string, analyze: boolean): Promise<string> {
  const o = owner();
  try {
    return await o.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: COACH1, role: "authenticated" })}, true)`;
      const rows = await tx.unsafe(`explain (${analyze ? "analyze, timing off, summary on, " : ""}costs off) select count(*) from public.${table}`);
      return rows.map((r) => r["QUERY PLAN"] as string).join("\n");
    });
  } finally {
    await o.end();
  }
}

beforeAll(async () => {
  [admin, coach1, coach2] = await Promise.all([signIn("admin@gym-arena.local"), signIn("coach1@gym-arena.local"), signIn("coach2@gym-arena.local")]);
});

describe.each(TABLES)("$policy", ({ table, policy }) => {
  it("is evaluated once per query (InitPlan + hashed subplan), never per row", async () => {
    const o = owner();
    const [p] = await o.unsafe(`select pg_get_expr(polqual, polrelid) as qual from pg_policy where polname = $1 and polrelid = $2::regclass`, [policy, `public.${table}`]);
    await o.end();
    expect(p.qual).toMatch(/\(\s*SELECT is_admin\(\)/);
    expect(p.qual).toMatch(/member_id IN \(\s*SELECT own_member_ids\(\)/);
    expect(p.qual).not.toMatch(/is_own_member/);
    const plan = await coachPlan(table, false);
    expect(plan).toMatch(/hashed SubPlan/);
    expect(plan).not.toMatch(/is_own_member/);
  });

  it("the access rule is unchanged: admin sees all; each coach exactly their own members' rows", async () => {
    expect(await visible(admin, table)).toBe(await truth(table));
    expect(await visible(coach1, table)).toBe(await truth(table, COACH1));
    expect(await visible(coach2, table)).toBe(await truth(table, COACH2));
  });

  it("another coach's rows are invisible; inactive coaches and signed-out callers read nothing", async () => {
    const o = owner();
    const [row] = await o.unsafe(`select t.member_id from public.${table} t join public.members m on m.id = t.member_id where m.coach_id = $1 limit 1`, [COACH2]);
    await o.end();
    expect(row).toBeTruthy();
    const peek = await coach1.from(table).select("member_id").eq("member_id", row.member_id);
    expect(peek.error).toBeNull();
    expect(peek.data).toEqual([]);
    const inactive = await inactiveProbeCoach(); // tests/FIXTURES.md
    expect(await visible(inactive, table)).toBe(0);
    const a = await anon().from(table).select("member_id").limit(1);
    expect(a.data ?? []).toEqual([]);
  });
});

describe("coach read cost", () => {
  it("reading all of a coach's entries stays fast (plan executes in well under a second)", async () => {
    const plan = await coachPlan("entries", true);
    const ms = Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1]);
    // was ~650 ms for ~4,000 rows with the per-row policy and grew linearly; the set-based plan
    // is a hash probe per row. 250 ms is a loose machine-independent ceiling for this size;
    // the plan-shape tests above are the exact guard.
    expect(ms).toBeLessThan(250);
  });
});
