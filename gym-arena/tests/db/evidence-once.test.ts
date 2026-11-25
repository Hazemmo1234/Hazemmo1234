/**
 * BR-E6: one evidence photo is the evidence for exactly one entry — atomically.
 * Requires migration 20261116000001_entry_evidence_once (unique index entries_photo_path_once).
 *
 * The API's own "photo already used" check runs before the insert, so on its own it cannot
 * stop two saves that race. These tests force the dangerous interleaving with two real
 * database transactions and prove the database refuses the second one, every time.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";
import { ACTIVE_SEASON, COACH1, newMember, owner, serverLog, signIn } from "./helpers";

let coach1: SupabaseClient;
const photo = (memberId: string) => `entries/${ACTIVE_SEASON}/${memberId}/${crypto.randomUUID()}.webp`;

/** server_log_entry inside an explicit transaction, the way PostgREST calls it for the service role. */
async function logIn(tx: postgres.TransactionSql, memberId: string, category: string, reps: number, path: string) {
  await tx`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
  const [row] = await tx`select (public.server_log_entry(${COACH1}::uuid, ${memberId}::uuid, ${category}::public.category_code, null, ${reps}, null, ${path})).id as id`;
  return row.id as string;
}

beforeAll(async () => {
  coach1 = await signIn("coach1@gym-arena.local");
});

describe("evidence photo used once (entries_photo_path_once)", () => {
  it("the unique index exists (partial: rows without a photo are unaffected)", async () => {
    const o = owner();
    const [idx] = await o`select indexdef from pg_indexes where schemaname = 'public' and indexname = 'entries_photo_path_once'`;
    await o.end();
    expect(idx?.indexdef).toMatch(/CREATE UNIQUE INDEX .* \(photo_path\) WHERE \(photo_path IS NOT NULL\)/);
  });

  it("forced race: B waits on A's uncommitted photo, then is refused when A commits", async () => {
    const m = await newMember(coach1);
    const path = photo(m.id);
    const a = owner();
    const b = owner();
    let releaseA!: () => void;
    const holdA = new Promise<void>((resolve) => (releaseA = resolve));
    let aInserted!: () => void;
    const aDone = new Promise<void>((resolve) => (aInserted = resolve));
    try {
      // A: insert with the photo and keep the transaction open
      const txA = a.begin(async (tx) => {
        await logIn(tx, m.id, "pullups", 5, path);
        aInserted();
        await holdA; // B starts while A is still uncommitted
      });
      await aDone;
      // B: same photo, different category (so only the photo can conflict); blocks on the index
      const txB = b.begin((tx) => logIn(tx, m.id, "pushups", 20, path)).then(
        () => "committed",
        (e: Error) => e.message,
      );
      await new Promise((r) => setTimeout(r, 300)); // B is now waiting on A's index entry
      releaseA();
      await txA;
      const outcome = await txB;
      expect(outcome).toMatch(/^VALIDATION: PHOTO_USED/);
    } finally {
      await a.end();
      await b.end();
    }
    const o = owner();
    const rows = await o`select category from public.entries where photo_path = ${path}`;
    await o.end();
    expect(rows.map((r) => r.category)).toEqual(["pullups"]); // exactly one entry owns the photo
  });

  it("six concurrent saves (one per category) with one photo: exactly one succeeds, the rest get PHOTO_USED", async () => {
    const m = await newMember(coach1);
    const path = photo(m.id);
    const cats = ["deadlift", "bench", "squat", "pullups", "pushups", "treadmill"] as const;
    const fields = (c: (typeof cats)[number]) =>
      c === "treadmill" ? { p_km: 2, p_photo_path: path } : c === "pullups" || c === "pushups" ? { p_reps: 5, p_photo_path: path } : { p_weight_kg: 50, p_reps: 5, p_photo_path: path };
    const results = await Promise.all(cats.map((c) => serverLog(COACH1, m.id, c, fields(c))));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    for (const r of results.filter((x) => x.error)) expect(r.error!.message).toMatch(/PHOTO_USED/);
  });

  it("an undone entry keeps its photo: undo-and-relog cannot reuse it; one-per-day still says ALREADY_LOGGED_TODAY", async () => {
    const m = await newMember(coach1);
    const path = photo(m.id);
    const first = await serverLog(COACH1, m.id, "pullups", { p_reps: 5, p_photo_path: path });
    expect(first.error).toBeNull();
    const { service } = await import("./helpers");
    expect((await service.rpc("server_void_entry", { p_actor: COACH1, p_entry_id: first.data.id })).error).toBeNull();
    const again = await serverLog(COACH1, m.id, "pullups", { p_reps: 6, p_photo_path: path });
    expect(again.error?.message).toMatch(/PHOTO_USED/);
    // the other unique rule is reported as before
    const p2 = photo(m.id);
    expect((await serverLog(COACH1, m.id, "pushups", { p_reps: 10, p_photo_path: p2 })).error).toBeNull();
    const dup = await serverLog(COACH1, m.id, "pushups", { p_reps: 11, p_photo_path: photo(m.id) });
    expect(dup.error?.message).toMatch(/^ALREADY_LOGGED_TODAY/);
    // entries without a photo never collide on the index
    expect((await serverLog(COACH1, m.id, "squat", { p_weight_kg: 40, p_reps: 5 })).error).toBeNull();
    expect((await serverLog(COACH1, m.id, "bench", { p_weight_kg: 40, p_reps: 5 })).error).toBeNull();
  });
});
