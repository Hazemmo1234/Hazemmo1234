import { createClient } from "@supabase/supabase-js";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LOCAL_ONLY, ownerSql, requireWriteTarget, signIn } from "./helpers";

/**
 * Members API (M2) — security, integrity and the photo pipeline, through the real HTTP
 * API. Every test here writes data, so the whole file runs only on the isolated stack.
 */
const COACH1 = "00000000-0000-4000-a000-000000000011";
const COACH2 = "00000000-0000-4000-a000-000000000012";
const ADMIN = "00000000-0000-4000-a000-000000000001";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = () => createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", opts);
const anon = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", opts);

let seq = 0;
const phone = () => `+2012${String(Date.now() % 10_000_000 + ++seq * 7).padStart(8, "0").slice(-8)}`;
const tinyWebp = () =>
  Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64"); // 1×1 webp

async function as(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(page).toHaveURL(email.startsWith("admin") ? /\/admin\/dashboard$/ : /\/today$/);
  return page.request;
}
async function create(req: APIRequestContext, body: object) {
  const r = await req.post("/api/members", { data: body });
  return { status: r.status(), json: await r.json() };
}
async function upload(req: APIRequestContext, memberId: string) {
  const r = await req.post("/api/uploads/avatar", { data: { member_id: memberId, content_type: "image/webp" } });
  expect(r.status()).toBe(200);
  const { path, token } = await r.json();
  const up = await anon().storage.from("avatars").uploadToSignedUrl(path, token, tinyWebp(), { contentType: "image/webp" });
  expect(up.error).toBeNull();
  return path as string;
}
/**
 * Moves a member's avatar files (and the member row's updated_at) into the past, directly
 * in the isolated test database — the only way to test a 10-minute grace period quickly.
 * session_replication_role=replica skips the trigger that would reset updated_at.
 */
async function age(memberId: string, minutes: number, onlyPath?: string) {
  requireWriteTarget();
  expect(memberId).toMatch(/^[0-9a-f-]{36}$/);
  if (onlyPath) expect(onlyPath).toMatch(/^members\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/);
  const files = onlyPath ? `name = '${onlyPath}'` : `name like 'members/${memberId}/%'`;
  const sql = [
    "set session_replication_role = replica;",
    `update storage.objects set created_at = now() - interval '${minutes} minutes' where bucket_id = 'avatars' and ${files};`,
    onlyPath ? "" : `update public.members set updated_at = now() - interval '${minutes} minutes' where id = '${memberId}';`,
  ].join(" ");
  await ownerSql(sql);
}
/** Runs one opportunistic cleanup pass (requesting an upload URL tidies the member's folder). */
async function tidy(req: APIRequestContext, memberId: string) {
  const r = await req.post("/api/uploads/avatar", { data: { member_id: memberId, content_type: "image/webp" } });
  expect(r.status()).toBe(200);
  return r;
}
async function folder(memberId: string) {
  const { data } = await service().storage.from("avatars").list(`members/${memberId}`);
  return (data ?? []).map((f) => `members/${memberId}/${f.name}`).sort();
}

test.describe("members API @writes", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "API tests run once");
    requireWriteTarget(); // only ever a verified test stack (fail closed)
  });

  test("AC-4/AC-5: codes are sequential; a coach's member is always theirs; phone normalized", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const a = await create(admin, { full_name: "Seq A", phone: phone(), coach_id: COACH1 });
    const b = await create(admin, { full_name: "Seq B", phone: phone(), coach_id: COACH1 });
    expect(a.status).toBe(201);
    expect(Number(b.json.member.member_code.slice(3))).toBe(Number(a.json.member.member_code.slice(3)) + 1);
    expect((await create(admin, { full_name: "No coach", phone: phone() })).json.error.reason).toBe("coach_required");

    const coach = await as(page, "coach1@gym-arena.local");
    const local = `012${String(Date.now()).slice(-8)}`; // typed as 012xxxxxxxx
    const mine = await create(coach, { full_name: "Spoof", phone: local, coach_id: COACH2, photo_consent: true });
    expect(mine.status).toBe(201);
    const { member } = await (await coach.get(`/api/members/${mine.json.member.id}`)).json();
    expect(member).toMatchObject({ coach_id: COACH1, phone: `+20${local.slice(1)}`, photo_consent: true, status: "active" });
  });

  test("duplicate phone: admin learns the existing code, a coach gets a generic message", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const p = phone();
    const first = await create(admin, { full_name: "Original", phone: p, coach_id: COACH2 });
    const dup = await create(admin, { full_name: "Copy", phone: p.replace("+20", "0"), coach_id: COACH1 });
    expect(dup.status).toBe(422);
    expect(dup.json.error).toMatchObject({ reason: "phone_taken", existing_code: first.json.member.member_code });
    const coach = await as(page, "coach1@gym-arena.local");
    const dup2 = await create(coach, { full_name: "Copy", phone: p });
    expect(dup2.json.error.reason).toBe("phone_taken");
    expect(dup2.json.error.existing_code).toBeUndefined(); // no leak of another coach's client
  });

  test("AC-3: coaches only see and change their own clients; admin-only actions refused", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const theirs = (await create(admin, { full_name: "Coach2 client", phone: phone(), coach_id: COACH2 })).json.member.id;
    const coach = await as(page, "coach1@gym-arena.local");
    const list = (await (await coach.get("/api/members")).json()).members as Array<{ coach_id: string }>;
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list.map((m) => m.coach_id))).toEqual(new Set([COACH1]));
    expect((await coach.get(`/api/members/${theirs}`)).status()).toBe(404);
    expect((await coach.patch(`/api/members/${theirs}`, { data: { full_name: "x" } })).status()).toBe(404);
    expect((await coach.patch(`/api/members/${theirs}/plan`, { data: { planned_sessions: 3 } })).status()).toBe(404);
    expect((await coach.post("/api/uploads/avatar", { data: { member_id: theirs, content_type: "image/webp" } })).status()).toBe(404);
    expect((await coach.post(`/api/members/${theirs}/reassign`, { data: { coach_id: COACH1 } })).status()).toBe(403);
    expect((await coach.post(`/api/members/${theirs}/status`, { data: { status: "inactive" } })).status()).toBe(403);
    const own = list[0] as unknown as { id: string };
    expect((await coach.post(`/api/members/${own.id}/reassign`, { data: { coach_id: COACH2 } })).status()).toBe(403);
    expect((await coach.patch(`/api/members/${own.id}`, { data: { coach_id: COACH2 } })).status()).toBe(422); // not a profile field
  });

  test("AC-6: reassignment moves access and keeps history; only to an active coach", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const id = (await create(admin, { full_name: "Mover", phone: phone(), coach_id: COACH1 })).json.member.id;
    expect((await admin.post(`/api/members/${id}/reassign`, { data: { coach_id: ADMIN } })).status()).toBe(422);
    expect((await (await admin.post(`/api/members/${id}/reassign`, { data: { coach_id: ADMIN } })).json()).error.reason).toBe("coach_not_active");
    expect((await admin.post(`/api/members/${id}/reassign`, { data: { coach_id: COACH2 } })).status()).toBe(200);
    const { member } = await (await admin.get(`/api/members/${id}`)).json();
    expect(member.coach_id).toBe(COACH2);
    expect(member.assignments.map((a: { coach_id: string; ended_at: string | null }) => [a.coach_id, a.ended_at === null])).toEqual([[COACH2, true], [COACH1, false]]);
    expect(member.assignments[0].coach_name).toBe("Coach Mariam");
    const c1 = await as(page, "coach1@gym-arena.local");
    expect((await c1.get(`/api/members/${id}`)).status()).toBe(404);
    const c2 = await as(page, "coach2@gym-arena.local");
    expect((await c2.get(`/api/members/${id}`)).status()).toBe(200);
  });

  test("BR-P5 + decision 5: deactivate, then reactivation needs an active coach", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const id = (await create(admin, { full_name: "Parked", phone: phone(), coach_id: COACH1 })).json.member.id;
    expect((await admin.post(`/api/members/${id}/status`, { data: { status: "inactive" } })).status()).toBe(200);
    expect((await (await admin.get(`/api/members?status=inactive`)).json()).members.some((m: { id: string }) => m.id === id)).toBe(true);
    const bad = await admin.post(`/api/members/${id}/status`, { data: { status: "active", coach_id: ADMIN } });
    expect((await bad.json()).error.reason).toBe("coach_not_active");
    expect((await admin.post(`/api/members/${id}/status`, { data: { status: "active", coach_id: COACH2 } })).status()).toBe(200);
    const { member } = await (await admin.get(`/api/members/${id}`)).json();
    expect(member).toMatchObject({ status: "active", coach_id: COACH2 });
  });

  test("plan: active season only, 1–31, coach own", async ({ page }) => {
    const coach = await as(page, "coach1@gym-arena.local");
    const id = (await create(coach, { full_name: "Planner", phone: phone(), planned_sessions: 8 })).json.member.id;
    let { member } = await (await coach.get(`/api/members/${id}`)).json();
    expect(member.plan.planned_sessions).toBe(8);
    expect((await coach.patch(`/api/members/${id}/plan`, { data: { planned_sessions: 0 } })).status()).toBe(422);
    expect((await coach.patch(`/api/members/${id}/plan`, { data: { planned_sessions: 16 } })).status()).toBe(200);
    ({ member } = await (await coach.get(`/api/members/${id}`)).json());
    expect(member.plan.planned_sessions).toBe(16);
  });

  test("API contract: PATCH, reassign and status return the updated member (same shape as GET)", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const id = (await create(admin, { full_name: "Contract", phone: phone(), coach_id: COACH1 })).json.member.id;
    const get = async (req: APIRequestContext) => (await (await req.get(`/api/members/${id}`)).json()).member;

    let r = await admin.patch(`/api/members/${id}`, { data: { full_name: "Contract Renamed", photo_consent: true } });
    expect(r.status()).toBe(200);
    let body = await r.json();
    expect(body.ok).toBeUndefined();
    expect(body.member).toMatchObject({ id, full_name: "Contract Renamed", photo_consent: true, coach_id: COACH1, status: "active" });
    expect(body.member).toEqual(await get(admin));

    r = await admin.post(`/api/members/${id}/reassign`, { data: { coach_id: COACH2 } });
    expect(r.status()).toBe(200);
    body = await r.json();
    expect(body.member).toMatchObject({ id, coach_id: COACH2 });
    expect(body.member.assignments.map((a: { coach_id: string }) => a.coach_id)).toEqual([COACH2, COACH1]);
    expect(body.member).toEqual(await get(admin));

    r = await admin.post(`/api/members/${id}/status`, { data: { status: "inactive" } });
    expect(r.status()).toBe(200);
    expect((await r.json()).member).toMatchObject({ id, status: "inactive", coach_id: COACH2 });
    r = await admin.post(`/api/members/${id}/status`, { data: { status: "active", coach_id: COACH1 } });
    expect(r.status()).toBe(200);
    body = await r.json();
    expect(body.member).toMatchObject({ id, status: "active", coach_id: COACH1 });
    expect(body.member).toEqual(await get(admin));

    // errors keep the error shape and return no member
    r = await admin.post(`/api/members/${id}/reassign`, { data: { coach_id: ADMIN } });
    expect(r.status()).toBe(422);
    expect(await r.json()).toEqual({ error: expect.objectContaining({ reason: "coach_not_active" }) });

    // a coach editing their own member gets the member back; another coach still gets 404
    const coach = await as(page, "coach1@gym-arena.local");
    r = await coach.patch(`/api/members/${id}`, { data: { full_name: "Contract Coach Edit" } });
    expect(r.status()).toBe(200);
    expect((await r.json()).member).toMatchObject({ id, full_name: "Contract Coach Edit", coach_id: COACH1 });
    const other = await as(page, "coach2@gym-arena.local");
    r = await other.patch(`/api/members/${id}`, { data: { full_name: "Hijack" } });
    expect(r.status()).toBe(404);
    expect((await r.json()).member).toBeUndefined();
  });

  test("photo: replacing or removing never deletes the previous file at once; consent off keeps the photo", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const id = (await create(admin, { full_name: "Photo", phone: phone(), coach_id: COACH1, photo_consent: true })).json.member.id;

    const first = await upload(admin, id);
    expect((await admin.patch(`/api/members/${id}`, { data: { photo_path: first } })).status()).toBe(200);
    let { member } = await (await admin.get(`/api/members/${id}`)).json();
    expect(member.photo_url).toMatch(/token=/); // short-lived signed URL, bucket stays private
    const oldUrl = member.photo_url as string;

    const orphan = await upload(admin, id); // a form that was never saved
    const second = await upload(admin, id);
    expect((await admin.patch(`/api/members/${id}`, { data: { photo_path: second } })).status()).toBe(200);
    expect(await folder(id)).toEqual([first, orphan, second].sort()); // nothing deleted yet
    expect((await fetch(oldUrl)).status).toBe(200); // a URL already handed out keeps working
    ({ member } = await (await admin.get(`/api/members/${id}`)).json());
    expect((await fetch(member.photo_url)).status).toBe(200);

    // consent off: the photo stays
    expect((await admin.patch(`/api/members/${id}`, { data: { photo_consent: false } })).status()).toBe(200);
    ({ member } = await (await admin.get(`/api/members/${id}`)).json());
    expect(member).toMatchObject({ photo_consent: false, has_photo: true });
    expect(await folder(id)).toEqual([first, orphan, second].sort());

    // removing the photo also deletes nothing immediately
    expect((await admin.patch(`/api/members/${id}`, { data: { photo_path: null } })).status()).toBe(200);
    expect(await folder(id)).toEqual([first, orphan, second].sort());
  });

  test("delayed cleanup: only files past the grace period and referenced by no member are removed", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const id = (await create(admin, { full_name: "Cleanup", phone: phone(), coach_id: COACH1 })).json.member.id;
    const first = await upload(admin, id);
    expect((await admin.patch(`/api/members/${id}`, { data: { photo_path: first } })).status()).toBe(200);
    const orphan = await upload(admin, id);
    const second = await upload(admin, id);
    expect((await admin.patch(`/api/members/${id}`, { data: { photo_path: second } })).status()).toBe(200);

    // 9 minutes later: still inside the grace period → a cleanup pass removes nothing
    await age(id, 9);
    await tidy(admin, id);
    expect(await folder(id)).toEqual([first, orphan, second].sort());

    // 11 minutes later: old photo and orphan go; the photo in use (just as old) is protected
    await age(id, 11);
    await tidy(admin, id);
    expect(await folder(id)).toEqual([second]);
    const { member } = await (await admin.get(`/api/members/${id}`)).json();
    expect(member.has_photo).toBe(true);
    expect((await fetch(member.photo_url)).status).toBe(200);

    // a stale upload can no longer be attached (attachable and deletable files never overlap)
    const late = await upload(admin, id);
    await age(id, 6, late);
    const r = await admin.patch(`/api/members/${id}`, { data: { photo_path: late } });
    expect((await r.json()).error.reason).toBe("photo_missing");
    expect(await folder(id)).toContain(second);

    // repeated cleanups are harmless
    await age(id, 11);
    await Promise.all([tidy(admin, id), tidy(admin, id), tidy(admin, id)]);
    expect(await folder(id)).toEqual([second]);
  });

  test("concurrent replacements: both succeed, the winning photo is served and nothing is lost", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const id = (await create(admin, { full_name: "Race", phone: phone(), coach_id: COACH1 })).json.member.id;
    const start = await upload(admin, id);
    expect((await admin.patch(`/api/members/${id}`, { data: { photo_path: start } })).status()).toBe(200);
    await age(id, 11); // the current photo is old: the race must still not delete anything in use

    const [a, b] = [await upload(admin, id), await upload(admin, id)];
    const results = await Promise.all([
      admin.patch(`/api/members/${id}`, { data: { photo_path: a } }),
      admin.patch(`/api/members/${id}`, { data: { photo_path: b } }),
      tidy(admin, id),
    ]);
    expect(results.slice(0, 2).map((x) => x.status())).toEqual([200, 200]);
    const { data: row } = await service().from("members").select("photo_path").eq("id", id).single();
    expect([a, b]).toContain(row!.photo_path);
    const files = await folder(id);
    expect(files).toEqual(expect.arrayContaining([a, b])); // both new uploads survive the race
    const { member } = await (await admin.get(`/api/members/${id}`)).json();
    expect((await fetch(member.photo_url)).status).toBe(200);

    // after the grace period only the winner remains
    await age(id, 11);
    await tidy(admin, id);
    expect(await folder(id)).toEqual([row!.photo_path]);
  });

  test("photo partial failures keep the existing valid photo", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const id = (await create(admin, { full_name: "Keep", phone: phone(), coach_id: COACH1 })).json.member.id;
    const other = (await create(admin, { full_name: "Other", phone: phone(), coach_id: COACH1 })).json.member.id;
    const good = await upload(admin, id);
    expect((await admin.patch(`/api/members/${id}`, { data: { photo_path: good } })).status()).toBe(200);

    // never uploaded
    let r = await admin.patch(`/api/members/${id}`, { data: { photo_path: `members/${id}/11111111-1111-4111-8111-111111111111.webp` } });
    expect((await r.json()).error.reason).toBe("photo_missing");
    // another member's file
    const foreign = await upload(admin, other);
    r = await admin.patch(`/api/members/${id}`, { data: { photo_path: foreign } });
    expect((await r.json()).error.reason).toBe("invalid_photo");
    // path tricks
    r = await admin.patch(`/api/members/${id}`, { data: { photo_path: `members/${id}/../${other}/x.webp` } });
    expect((await r.json()).error.reason).toBe("invalid_photo");

    expect(await folder(id)).toEqual([good]); // untouched
    const { member } = await (await admin.get(`/api/members/${id}`)).json();
    expect(member.has_photo).toBe(true);
  });

  test("storage: a coach cannot upload into, read or overwrite another coach's member folder", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const theirs = (await create(admin, { full_name: "Private", phone: phone(), coach_id: COACH2 })).json.member.id;
    const path = await upload(admin, theirs);
    await admin.patch(`/api/members/${theirs}`, { data: { photo_path: path } });
    const c1 = anon();
    await c1.auth.signInWithPassword({ email: "coach1@gym-arena.local", password: "Password123!" });
    expect((await c1.storage.from("avatars").download(path)).error).not.toBeNull();
    expect((await c1.storage.from("avatars").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await c1.storage.from("avatars").upload(`members/${theirs}/x.webp`, tinyWebp(), { contentType: "image/webp" })).error).not.toBeNull();
    expect((await c1.storage.from("avatars").remove([path])).data ?? []).toHaveLength(0);
    expect(await folder(theirs)).toEqual([path]);
  });

  test("rookie flag matches the scoring module on real data", async ({ page }) => {
    const admin = await as(page, "admin@gym-arena.local");
    const { members } = await (await admin.get("/api/members?status=active")).json();
    const rookies = members.filter((m: { is_rookie: boolean }) => m.is_rookie).map((m: { member_code: string }) => m.member_code);
    // seed: members 34–38 are the rookies; every member created by these tests has no history either
    for (const code of ["GA-000034", "GA-000035", "GA-000036", "GA-000037", "GA-000038"]) expect(rookies).toContain(code);
    for (const code of ["GA-000001", "GA-000002", "GA-000033"]) expect(rookies).not.toContain(code);
  });
});
