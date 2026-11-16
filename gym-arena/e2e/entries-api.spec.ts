import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { LOCAL_ONLY, signIn } from "./helpers";

/**
 * Entries, attendance, evidence and undo (M3) through the real HTTP API on the isolated
 * test stack. Every test writes data, so the file runs only there (@writes).
 */
const COACH1 = "00000000-0000-4000-a000-000000000011";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = () => createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", opts);
const anon = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", opts);
const tinyWebp = () => Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");
const cairoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

let seq = 0;
const phone = () => `+2011${String(Date.now() % 100_000_000 + ++seq * 13).padStart(8, "0").slice(-8)}`;

async function as(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(page).toHaveURL(email.startsWith("admin") ? /\/admin\/dashboard$/ : /\/today$/);
  return page.request;
}
async function post(req: APIRequestContext, path: string, data: object) {
  const r = await req.post(path, { data });
  return { status: r.status(), json: await r.json() };
}
async function newClient(req: APIRequestContext, name = "Entry Test") {
  const r = await post(req, "/api/members", { full_name: `${name} ${Date.now() % 100000}`, phone: phone() });
  expect(r.status).toBe(201);
  return r.json.member.id as string;
}
async function evidence(req: APIRequestContext, memberId: string) {
  const r = await post(req, "/api/uploads/evidence", { member_id: memberId, content_type: "image/webp" });
  expect(r.status).toBe(200);
  const up = await anon().storage.from("evidence").uploadToSignedUrl(r.json.path, r.json.token, tinyWebp(), { contentType: "image/webp" });
  expect(up.error).toBeNull();
  return r.json.path as string;
}

/**
 * Baselines need entries BEFORE the active season. The API never allows that (by design),
 * so the fixture writes them as the database owner into a far-past open season, directly
 * in the isolated test database. The entry triggers still validate shape and compute values.
 */
function baselines(memberId: string, rows: Array<{ category: string; weight_kg?: number; reps?: number; km?: number }>) {
  expect(url).toMatch(/:56321$/);
  expect(memberId).toMatch(/^[0-9a-f-]{36}$/);
  const values = rows.map((r) => `('${memberId}', '00000000-0000-0000-0000-000000000000', '${r.category}', '1652-01-10', ${r.weight_kg ?? "null"}, ${r.reps ?? "null"}, ${r.km ?? "null"}, 0, '${COACH1}')`).join(",");
  const sql = [
    "insert into public.seasons (name, type, starts_on, ends_on) select 'M3 baseline fixture', 'championship', '1652-01-01', '1652-01-28' where not exists (select 1 from public.seasons where name = 'M3 baseline fixture');",
    `insert into public.entries (member_id, season_id, category, performed_on, weight_kg, reps, km, value, logged_by) values ${values};`,
  ].join(" ");
  execFileSync("docker", ["exec", "supabase_db_gym-arena-test", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qc", sql]);
}

test.describe("entries API @writes", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "API tests run once");
    expect(url).toMatch(/:56321$/); // only ever the isolated test stack
  });

  test("preview → save agree; photo rule enforced by the server; duplicate refused", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    const id = await newClient(coach);

    // treadmill counts for everyone (rookies too) until 50 km are credited → photo required (SCORING §6)
    const preview = await post(coach, "/api/entries/preview", { member_id: id, category: "treadmill", km: "3" });
    expect(preview.status).toBe(200);
    // the treadmill category gains 3 km × 4 = 12; the total also gains the Consistency of the
    // attendance the save records automatically (BR-E7): 1 of 12 planned × 200 = 16.67
    expect(preview.json).toMatchObject({ value: "3.0", is_new_best: false, points_before: 0, points_after: 12, points_delta: 28.67, points_delta_display: 29, photo_required: true });

    // no photo → 422 PHOTO_REQUIRED, nothing written
    let r = await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "3" });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("PHOTO_REQUIRED");
    const { count } = await service().from("entries").select("id", { count: "exact", head: true }).eq("member_id", id);
    expect(count).toBe(0);

    // with a fresh photo in this member's evidence folder → 201 { entry, member_card }
    const path = await evidence(coach, id);
    r = await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "3", photo_path: path });
    expect(r.status).toBe(201);
    expect(r.json.entry).toMatchObject({ member_id: id, category: "treadmill", logged_by: COACH1, performed_on: cairoToday(), photo_path: path });
    expect(r.json.member_card.total).toBe(preview.json.total_after); // the preview and the persisted result agree
    expect(r.json.member_card.attended_today).toBe(true); // BR-E7 auto attendance
    expect(r.json.member_card.categories.find((c: { code: string }) => c.code === "treadmill")).toMatchObject({ logged_today: true, month_best: "3.0", points: 12 });
    const { data: att } = await service().from("attendance").select("source").eq("member_id", id).is("voided_at", null);
    expect(att).toEqual([{ source: "auto" }]);

    // BR-E2: one per category per day — preview and save both say so
    expect((await post(coach, "/api/entries/preview", { member_id: id, category: "treadmill", km: "2" })).json.error.code).toBe("ALREADY_LOGGED_TODAY");
    r = await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "2", photo_path: await evidence(coach, id) });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("ALREADY_LOGGED_TODAY");

    // a rookie earns no test-category points → no photo needed for pull-ups
    r = await post(coach, "/api/entries", { member_id: id, category: "pullups", reps: 8 });
    expect(r.status).toBe(201);
    expect(r.json.member_card.is_rookie).toBe(true);

    // rapid double submit: exactly one entry
    const twice = await Promise.all([1, 2].map(() => post(coach, "/api/entries", { member_id: id, category: "pushups", reps: 20 })));
    expect(twice.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  test("a new best for a member with a baseline needs a photo; the preview says how many points", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    // a seeded, non-rookie client of coach 1 with a baseline in a category not yet at its cap
    const { members } = await (await coach.get("/api/members?status=active")).json();
    let chosen: { id: string; code: string; best: number } | null = null;
    for (const m of members.filter((x: { member_code: string }) => Number(x.member_code.slice(3)) < 34)) {
      const { card } = await (await coach.get(`/api/members/${m.id}`)).json();
      const tile = card.categories.find((c: { code: string; has_baseline: boolean; at_cap: boolean; logged_today: boolean }) =>
        ["pullups", "pushups"].includes(c.code) && c.has_baseline && !c.at_cap && !c.logged_today);
      if (tile) {
        chosen = { id: m.id, code: tile.code, best: Math.max(Number(tile.baseline), Number(tile.month_best ?? 0)) };
        break;
      }
    }
    expect(chosen).not.toBeNull();
    const better = await post(coach, "/api/entries/preview", { member_id: chosen!.id, category: chosen!.code, reps: chosen!.best + 1 });
    expect(better.json).toMatchObject({ is_new_best: true, photo_required: true });
    expect(better.json.points_delta).toBeGreaterThan(0);
    const same = await post(coach, "/api/entries/preview", { member_id: chosen!.id, category: chosen!.code, reps: Math.max(0, chosen!.best - 1) });
    expect(same.json).toMatchObject({ is_new_best: false, photo_required: false, points_delta: 0 });
    expect((await post(coach, "/api/entries", { member_id: chosen!.id, category: chosen!.code, reps: chosen!.best + 1 })).json.error.code).toBe("PHOTO_REQUIRED");
  });

  test("validation: the scoring module's rules, strict shapes, evidence path tricks", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    const id = await newClient(coach, "Validate");
    const other = await newClient(coach, "Other");
    const reason = async (body: object) => (await post(coach, "/api/entries/preview", { member_id: id, ...body })).json.error.reason;
    expect(await reason({ category: "deadlift", weight_kg: "100", reps: 6 })).toBe("reps:OUT_OF_RANGE");
    expect(await reason({ category: "deadlift", weight_kg: "100.3", reps: 5 })).toBe("weightKg:STEP");
    expect(await reason({ category: "deadlift", weight_kg: "600", reps: 5 })).toBe("weightKg:OUT_OF_RANGE");
    expect(await reason({ category: "treadmill", km: "0.15" })).toBe("km:STEP");
    expect(await reason({ category: "pullups", reps: 101 })).toBe("reps:OUT_OF_RANGE");
    let r = await post(coach, "/api/entries/preview", { member_id: id, category: "deadlift", weight_kg: "100", reps: 5, km: "1" });
    expect(r.status).toBe(422); // a field the category does not take
    r = await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "2", logged_by: COACH1 });
    expect(r.status).toBe(422); // unknown fields are refused, never trusted (AC-40)

    // evidence must be a fresh upload in THIS member's folder
    const foreign = await evidence(coach, other);
    r = await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "2", photo_path: foreign });
    expect(r.json.error.reason).toBe("invalid_photo");
    const real = await evidence(coach, id);
    const missing = real.replace(/[0-9a-f-]{36}\.webp$/, "11111111-1111-4111-8111-111111111111.webp");
    r = await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "2", photo_path: missing });
    expect(r.json.error.reason).toBe("photo_missing");
    r = await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "2", photo_path: `${real}/../x.webp` });
    expect(r.json.error.reason).toBe("invalid_photo");

    // a coach cannot backdate: performed_on is ignored, the Cairo date is used (BR-E3, AC-11)
    r = await post(coach, "/api/entries", { member_id: id, category: "pushups", reps: 10, performed_on: "2026-11-01" });
    expect(r.status).toBe(201);
    expect(r.json.entry.performed_on).toBe(cairoToday());
  });

  test("attendance: manual once a day; reflected on the card", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    const id = await newClient(coach, "Attend");
    let r = await post(coach, "/api/attendance", { member_id: id });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, member_card: { attended_today: true, attended: 1 } });
    r = await post(coach, "/api/attendance", { member_id: id });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("ALREADY_LOGGED_TODAY");
    const { data } = await service().from("attendance").select("source, logged_by").eq("member_id", id);
    expect(data).toEqual([{ source: "manual", logged_by: COACH1 }]);
    // a result the same day does not add a second attendance row (BR-E2)
    expect((await post(coach, "/api/entries", { member_id: id, category: "pullups", reps: 3 })).status).toBe(201);
    const { count } = await service().from("attendance").select("id", { count: "exact", head: true }).eq("member_id", id).is("voided_at", null);
    expect(count).toBe(1);
  });

  test("undo: own entry, same day; history kept and audited; points recalculated", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    const id = await newClient(coach, "Undo");
    const path = await evidence(coach, id);
    const saved = await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "4", photo_path: path });
    expect(saved.status).toBe(201);
    expect(saved.json.member_card.total).toBeGreaterThan(0);
    const entryId = saved.json.entry.id as string;

    const r = await post(coach, `/api/entries/${entryId}/void`, {});
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.member_card.categories.find((c: { code: string }) => c.code === "treadmill")).toMatchObject({ logged_today: false, points: 0 });
    expect(r.json.member_card.today_entries[0]).toMatchObject({ id: entryId, voided: true, can_undo: false });
    expect(r.json.member_card.attended_today).toBe(false); // BR-E10: its auto attendance went with it

    const { data: row } = await service().from("entries").select("voided_at, voided_by, photo_path").eq("id", entryId).single();
    expect(row!.voided_at).not.toBeNull();
    expect(row!.voided_by).toBe(COACH1);
    expect(row!.photo_path).toBe(path); // nothing deleted (BR-E8)
    const { data: audit } = await service().from("audit_log").select("action, actor_id").eq("entity_id", entryId);
    expect(audit).toContainEqual({ action: "entry.void", actor_id: COACH1 });

    const again = await post(coach, `/api/entries/${entryId}/void`, {});
    expect(again.status).toBe(403);
    expect(again.json.error.reason).toBe("already_voided");
    // the category can be logged again after an undo
    expect((await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "4", photo_path: await evidence(coach, id) })).status).toBe(201);
  });

  test("ownership: another coach sees nothing; an admin's entry cannot be undone by the coach (D26)", async ({ page }) => {
    let req = await as(page, "coach1@gym-arena.local");
    const id = await newClient(req, "Owned");
    const mine = await post(req, "/api/entries", { member_id: id, category: "pullups", reps: 5 });
    expect(mine.status).toBe(201);

    req = await as(page, "coach2@gym-arena.local");
    for (const [path, body] of [
      ["/api/entries/preview", { member_id: id, category: "pushups", reps: 5 }],
      ["/api/entries", { member_id: id, category: "pushups", reps: 5 }],
      ["/api/attendance", { member_id: id }],
      ["/api/uploads/evidence", { member_id: id, content_type: "image/webp" }],
      [`/api/entries/${mine.json.entry.id}/void`, {}],
    ] as const) {
      const r = await post(req, path, body);
      expect(r.status, path).toBe(404);
      expect(JSON.stringify(r.json)).not.toContain("Owned");
    }
    expect((await req.get(`/api/members/${id}`)).status()).toBe(404);

    req = await as(page, "admin@gym-arena.local");
    const adminEntry = await post(req, "/api/entries", { member_id: id, category: "pushups", reps: 12 });
    expect(adminEntry.status).toBe(201);
    expect(adminEntry.json.entry.logged_by).not.toBe(COACH1);
    // the admin must give a reason (BR-E11)
    expect((await post(req, `/api/entries/${mine.json.entry.id}/void`, {})).status).toBe(422);

    req = await as(page, "coach1@gym-arena.local");
    const { card } = await (await req.get(`/api/members/${id}`)).json();
    expect(card.today_entries.find((e: { id: string }) => e.id === adminEntry.json.entry.id).can_undo).toBe(false);
    const r = await post(req, `/api/entries/${adminEntry.json.entry.id}/void`, {});
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("FORBIDDEN");
  });

  test("scoring integrity: every category — preview equals the persisted result; caps, decimals, new best", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    const id = await newClient(coach, "Integrity");
    baselines(id, [
      { category: "deadlift", weight_kg: 100, reps: 5 }, // e1RM 116.667
      { category: "bench", weight_kg: 60, reps: 5 }, // e1RM 70
      { category: "squat", weight_kg: 80, reps: 5 }, // e1RM 93.333
      { category: "pullups", reps: 5 },
      { category: "pushups", reps: 20 },
    ]);
    const { card: before } = await (await coach.get(`/api/members/${id}`)).json();
    expect(before.is_rookie).toBe(false);
    expect(before.categories.find((c: { code: string }) => c.code === "deadlift")).toMatchObject({ baseline: "116.7", has_baseline: true });

    // [body, expected value, expected category points after] — SCORING §2–§3
    const cases: Array<[Record<string, unknown>, string, number, boolean]> = [
      [{ category: "deadlift", weight_kg: "105", reps: 5 }, "122.5", 33.33, false], // +5 % of 15 % → 33.33
      [{ category: "bench", weight_kg: "62.5", reps: 4 }, "70.8", 7.94, false], // e1RM 70.8333: +1.19 % → 7.94
      [{ category: "squat", weight_kg: "100", reps: 5 }, "116.7", 100, true], // +25 % → capped at 100
      [{ category: "pullups", reps: 8 }, "8", 90, false], // +3 reps × 30
      [{ category: "pushups", reps: 35 }, "35", 150, true], // +15 > max gain 10 → capped at 150
      [{ category: "treadmill", km: "2.5" }, "2.5", 10, false], // 2.5 km × 4
    ];
    for (const [body, value, points, capped] of cases) {
      const p = await post(coach, "/api/entries/preview", { member_id: id, ...body });
      expect(p.status, String(body.category)).toBe(200);
      expect(p.json, String(body.category)).toMatchObject({ value, points_after: points, photo_required: true, is_new_best: body.category !== "treadmill" });
      const saved = await post(coach, "/api/entries", { member_id: id, ...body, photo_path: await evidence(coach, id) });
      expect(saved.status, String(body.category)).toBe(201);
      const tile = saved.json.member_card.categories.find((c: { code: string }) => c.code === body.category);
      expect(tile.points, String(body.category)).toBe(points); // persisted = preview
      expect(tile.at_cap, String(body.category)).toBe(capped);
      expect(saved.json.member_card.total, String(body.category)).toBe(p.json.total_after); // total = preview
      expect(saved.json.member_card.total_display).toBe(p.json.total_after_display);
    }
    // the stored value matches the scoring module's e1RM (4-decimal storage, never used for scoring)
    const { data } = await service().from("entries").select("category, value").eq("member_id", id).eq("category", "bench").is("voided_at", null).gte("performed_on", cairoToday());
    expect(Number(data![0].value)).toBeCloseTo(70.8333, 4);

    // undo the capped squat: its points drop to 0 and the total drops by exactly that much
    const { card } = await (await coach.get(`/api/members/${id}`)).json();
    const squat = card.today_entries.find((e: { category: string }) => e.category === "squat");
    const undone = await post(coach, `/api/entries/${squat.id}/void`, {});
    expect(undone.json.member_card.categories.find((c: { code: string }) => c.code === "squat").points).toBe(0);
    expect(Math.round((card.total - undone.json.member_card.total) * 100) / 100).toBe(100);
  });

  test("BR-E10: manual attendance survives an undo; auto attendance goes only with the day's last entry", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    // manual first, then a result, then undo → still attended (manual stays)
    const a = await newClient(coach, "ManualStay");
    expect((await post(coach, "/api/attendance", { member_id: a })).status).toBe(200);
    const e = await post(coach, "/api/entries", { member_id: a, category: "pullups", reps: 4 });
    const r = await post(coach, `/api/entries/${e.json.entry.id}/void`, {});
    expect(r.json.member_card).toMatchObject({ attended_today: true, attended: 1 });

    // two results: undoing one keeps the auto attendance; undoing the last removes it
    const b = await newClient(coach, "TwoEntries");
    const e1 = await post(coach, "/api/entries", { member_id: b, category: "pullups", reps: 4 });
    const e2 = await post(coach, "/api/entries", { member_id: b, category: "pushups", reps: 10 });
    let v = await post(coach, `/api/entries/${e1.json.entry.id}/void`, {});
    expect(v.json.member_card.attended_today).toBe(true);
    v = await post(coach, `/api/entries/${e2.json.entry.id}/void`, {});
    expect(v.json.member_card).toMatchObject({ attended_today: false, attended: 0 });
    const { data } = await service().from("attendance").select("source, voided_at").eq("member_id", b);
    expect(data).toHaveLength(1); // voided, never deleted (BR-E8)
    expect(data![0].voided_at).not.toBeNull();
    // and attendance can be recorded again afterwards
    expect((await post(coach, "/api/attendance", { member_id: b })).status).toBe(200);
  });

  test("evidence: one photo per result; the spec's { member_id } body works", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    const id = await newClient(coach, "PhotoOnce");
    const plain = await post(coach, "/api/uploads/evidence", { member_id: id });
    expect(plain.status).toBe(200);
    expect(plain.json.path).toMatch(/\.webp$/);
    const path = await evidence(coach, id);
    expect((await post(coach, "/api/entries", { member_id: id, category: "treadmill", km: "1", photo_path: path })).status).toBe(201);
    const reuse = await post(coach, "/api/entries", { member_id: id, category: "pullups", reps: 3, photo_path: path });
    expect(reuse.status).toBe(422);
    expect(reuse.json.error.reason).toBe("photo_used");

    // concurrent saves with one fresh photo: the API's early check cannot see the other
    // request; the unique index (migration 20261116000001) lets exactly one through
    const shared = await evidence(coach, id);
    const race = await Promise.all([
      post(coach, "/api/entries", { member_id: id, category: "pushups", reps: 12, photo_path: shared }),
      post(coach, "/api/entries", { member_id: id, category: "deadlift", weight_kg: "60", reps: 5, photo_path: shared }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(race.find((r) => r.status === 422)!.json.error.reason).toBe("photo_used");
    const { count } = await service().from("entries").select("id", { count: "exact", head: true }).eq("photo_path", shared);
    expect(count).toBe(1);
  });

  test("signed-out callers get 401; nothing is written", async ({ page }) => {
    await page.context().clearCookies();
    for (const path of ["/api/entries/preview", "/api/entries", "/api/attendance", "/api/uploads/evidence"]) {
      expect((await page.request.post(path, { data: {} })).status(), path).toBe(401);
    }
  });
});
