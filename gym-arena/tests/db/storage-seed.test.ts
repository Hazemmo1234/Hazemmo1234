/**
 * Evidence storage isolation (BR-X3, SECURITY_SPECIFICATION §8) and seed safety (§10).
 * Regression tests for audit findings S-5 and S-6.
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { ACTIVE_SEASON, MEMBER_OF_COACH2, PAST_SEASON, URL, anon, newMember, owner, signIn } from "./helpers";

let coach1: SupabaseClient, coach2: SupabaseClient;
beforeAll(async () => {
  [coach1, coach2] = await Promise.all([signIn("coach1@gym-arena.local"), signIn("coach2@gym-arena.local")]);
});
const img = () => new Blob(["x"], { type: "image/webp" });
const name = () => `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;

describe("evidence storage (BR-X3)", () => {
  it("coach uploads for own member; nobody else can read it; bucket is not public", async () => {
    const m = await newMember(coach1);
    const path = `entries/${ACTIVE_SEASON}/${m.id}/${name()}`;
    expect((await coach1.storage.from("evidence").upload(path, img())).error).toBeNull();
    expect((await coach1.storage.from("evidence").download(path)).error).toBeNull();
    expect((await coach2.storage.from("evidence").download(path)).error).not.toBeNull();
    expect((await coach2.storage.from("evidence").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await anon().storage.from("evidence").download(path)).error).not.toBeNull();
    expect((await fetch(`${URL}/storage/v1/object/public/evidence/${path}`)).status).not.toBe(200);
    expect((await coach2.storage.from("evidence").list(`entries/${ACTIVE_SEASON}/${m.id}`)).data ?? []).toHaveLength(0);
    // evidence cannot be overwritten or deleted by clients
    expect((await coach1.storage.from("evidence").upload(path, img(), { upsert: true })).error).not.toBeNull();
    expect((await coach1.storage.from("evidence").remove([path])).data ?? []).toHaveLength(0);
    expect((await coach1.storage.from("evidence").download(path)).error).toBeNull();
  });

  it("S-6 regression: path must name a real open season and the caller's own member", async () => {
    const m = await newMember(coach1);
    const bad = [
      `entries/${ACTIVE_SEASON}/${MEMBER_OF_COACH2}/${name()}`,          // another coach's member
      `entries/not-a-season/${m.id}/${name()}`,                          // bogus season
      `entries/${PAST_SEASON}/${m.id}/${name()}`,                        // closed season
      `entries/${ACTIVE_SEASON}/${m.id}/nested/${name()}`,               // unexpected depth
      `other/${ACTIVE_SEASON}/${m.id}/${name()}`,                        // wrong root
    ];
    for (const path of bad) {
      expect((await coach1.storage.from("evidence").upload(path, img())).error, path).not.toBeNull();
    }
    const html = await coach1.storage.from("evidence").upload(`entries/${ACTIVE_SEASON}/${m.id}/x.html`, new Blob(["<p>"], { type: "text/html" }));
    expect(html.error?.message).toMatch(/mime type/);
  });

  it("avatars: own member only", async () => {
    const m = await newMember(coach1);
    expect((await coach1.storage.from("avatars").upload(`members/${m.id}/${name()}`, img())).error).toBeNull();
    expect((await coach1.storage.from("avatars").upload(`members/${MEMBER_OF_COACH2}/${name()}`, img())).error).not.toBeNull();
  });
});

describe("S-5 regression: seed.sql refuses to run where it should not", () => {
  const seed = readFileSync("supabase/seed.sql", "utf8");

  it("the guard is the first statement of the seed", () => {
    const firstStatement = seed.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).slice(0, 8).join("\n");
    expect(firstStatement).toMatch(/^do \$\$/);
    expect(firstStatement).toMatch(/SEED_REFUSED/);
  });

  it("refuses on a database that already has accounts, and changes nothing", async () => {
    const o = owner();
    const [before] = await o`select count(*)::int as n from public.members`;
    await expect(o.unsafe(seed)).rejects.toThrow(/SEED_REFUSED: this database already has accounts/);
    const [after] = await o`select count(*)::int as n from public.members`;
    expect(after.n).toBe(before.n);
    await o.end();
  });

  it("refuses when the database is not a local development stack", async () => {
    const o = owner();
    await expect(o.begin(async (tx) => {
      await tx`select set_config('app.settings.jwt_secret', 'a-real-cloud-project-secret', true)`;
      await tx.unsafe(seed);
    })).rejects.toThrow(/SEED_REFUSED: seed.sql runs only on a local development database/);
    await o.end();
  });
});
