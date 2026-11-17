/**
 * Regression: season participant counts (Seasons list, GET /api/seasons).
 *
 * The list used to download every season_participants row and count in JavaScript.
 * The API returns at most `max_rows` (1000) rows, so once the table held more than 1000
 * rows the newest seasons silently showed too few — often 0 — participants.
 * These tests run against the real local API with its real row limit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { today } from "@/lib/time";
import { COACH1, anon, owner, signIn } from "./helpers";

vi.mock("server-only", () => ({})); // the service is server-only; this test is a trusted server-side caller
const { listSeasons } = await import("@/modules/seasons/service");

const API_MAX_ROWS = 1000; // supabase/config.toml [api] max_rows

let admin: SupabaseClient, coach1: SupabaseClient;
let zeroSeason: string, fiveSeason: string;
const created: string[] = [];

async function dbCounts(where = "true"): Promise<Map<string, number>> {
  const o = owner();
  const rows = await o.unsafe(`select s.id, (select count(*)::int from public.season_participants sp
      join public.members m on m.id = sp.member_id where sp.season_id = s.id and ${where}) as n from public.seasons s`);
  await o.end();
  return new Map(rows.map((r) => [r.id as string, r.n as number]));
}
async function totalParticipants(): Promise<number> {
  const o = owner();
  const [{ n }] = await o`select count(*)::int as n from public.season_participants`;
  await o.end();
  return n;
}
/**
 * A far-future championship on a random month no other test uses; the database adds
 * every active member as a participant. Retries on the (rare) overlap with a season left
 * by an earlier run on the same stack.
 */
async function createSeason(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const year = 3000 + Math.floor(Math.random() * 5000);
    const mm = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
    const { data, error } = await admin.from("seasons")
      .insert({ name: `Count regression ${year}-${mm}`, type: "championship", starts_on: `${year}-${mm}-01`, ends_on: `${year}-${mm}-28` })
      .select("id").single();
    if (!error) {
      created.push(data.id);
      return data.id;
    }
    if (!error.message.includes("seasons_no_overlap")) throw error;
  }
  throw new Error("could not find a free month");
}

beforeAll(async () => {
  [admin, coach1] = await Promise.all([signIn("admin@gym-arena.local"), signIn("coach1@gym-arena.local")]);
  zeroSeason = await createSeason();
  fiveSeason = await createSeason();
  await createSeason();
  // Reproduce the real failure condition: more participant rows than the API returns.
  while ((await totalParticipants()) <= API_MAX_ROWS + 200) await createSeason();

  // Fixture shapes the database would otherwise never produce on a busy stack:
  // a season with no participants, and one with exactly five.
  const o = owner();
  await o`delete from public.season_participants where season_id = ${zeroSeason}`;
  await o`delete from public.season_participants where season_id = ${fiveSeason}
          and member_id not in (select member_id from public.season_participants where season_id = ${fiveSeason} order by member_id limit 5)`;
  await o.end();
}, 120_000);

describe("season participant counts", () => {
  it("precondition: the table exceeds the API row limit, and a plain row fetch is truncated", async () => {
    const total = await totalParticipants();
    expect(total).toBeGreaterThan(API_MAX_ROWS);
    const naive = await admin.from("season_participants").select("season_id");
    expect(naive.error).toBeNull();
    expect(naive.data!.length).toBe(API_MAX_ROWS); // what the old implementation counted from
  });

  it("every season gets its own exact count (admin), and the old method would have been wrong", async () => {
    const seasons = await listSeasons(admin, today());
    const truth = await dbCounts();
    expect(seasons.length).toBe(truth.size);
    for (const s of seasons) expect(s.participants, s.name).toBe(truth.get(s.id));

    // the regression: counting a truncated row download disagrees with the truth
    const naive = await admin.from("season_participants").select("season_id");
    const old = new Map<string, number>();
    for (const r of naive.data ?? []) old.set(r.season_id, (old.get(r.season_id) ?? 0) + 1);
    expect(seasons.some((s) => (old.get(s.id) ?? 0) !== s.participants)).toBe(true);
  });

  it("multiple new seasons each report their own count; zero is zero and five is five", async () => {
    const byId = new Map((await listSeasons(admin, today())).map((s) => [s.id, s]));
    const truth = await dbCounts();
    expect(byId.get(zeroSeason)!.participants).toBe(0);
    expect(byId.get(fiveSeason)!.participants).toBe(5);
    const full = created.filter((id) => id !== zeroSeason && id !== fiveSeason);
    expect(full.length).toBeGreaterThan(0);
    for (const id of full) {
      expect(truth.get(id)).toBeGreaterThan(0);
      expect(byId.get(id)!.participants).toBe(truth.get(id));
    }
  });

  it("authorization is unchanged: a coach counts only their own clients; signed-out callers get nothing", async () => {
    const seasons = await listSeasons(coach1, today());
    const own = await dbCounts(`m.coach_id = '${COACH1}'`);
    expect(seasons.length).toBe(own.size);
    for (const s of seasons) expect(s.participants, s.name).toBe(own.get(s.id));
    expect(seasons.find((s) => s.id === zeroSeason)!.participants).toBe(0);

    await expect(listSeasons(anon(), today())).rejects.toThrow();
  });

  it("the response shape is unchanged (no embedded rows leak into the list)", async () => {
    const [first] = await listSeasons(admin, today());
    expect(Object.keys(first).sort()).toEqual(
      ["closed_at", "created_at", "days", "ends_on", "id", "name", "participants", "reveal_started_at", "starts_on", "status", "type"],
    );
    expect(typeof first.participants).toBe("number");
  });
});
