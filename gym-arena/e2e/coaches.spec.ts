import { createClient } from "@supabase/supabase-js";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LOCAL_ONLY, PASSWORD, expectLanguage, requireWriteTarget, signIn } from "./helpers";

// UX A4 Coaches (M2), BR-P7, D28, AC-1, AC-48 … AC-50.
const VIEWPORTS = { phone: { width: 360, height: 780 }, ipad: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };
const COACH1 = "00000000-0000-4000-a000-000000000011";
const ADMIN = "00000000-0000-4000-a000-000000000001";

async function openCoaches(page: Page, locale: "ar" | "en") {
  await page.request.post("/api/locale", { data: { locale } });
  await page.goto("/admin/coaches");
  await page.waitForLoadState("networkidle");
  await expectLanguage(page, locale);
}

test.describe("coaches", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "viewports are set per test; run once");
    await signIn(page, "admin@gym-arena.local");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
  test.afterEach(async ({ page }) => {
    await page.request.post("/api/locale", { data: { locale: "ar" } });
  });

  test("list shows each coach with email, status and active clients", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await openCoaches(page, "en");
    const omar = page.getByRole("listitem").filter({ hasText: "Coach Omar" });
    await expect(omar.getByText("coach1@gym-arena.local")).toBeVisible();
    await expect(omar.getByText("Active", { exact: true })).toBeVisible();
    await expect(omar.getByText(/\d+ active clients?/)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Hazem (Admin)" })).toHaveCount(0); // admins are not coaches
  });

  test("create dialog validates name, email and the 10-character password on the client", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.ipad);
    await openCoaches(page, "en");
    await page.getByRole("button", { name: "New coach" }).click();
    const dialog = page.getByRole("dialog", { name: "New coach" });
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog.getByText("Enter the coach's name.")).toBeVisible();
    await dialog.getByLabel("Full name").fill("Coach Test");
    await dialog.getByLabel("Email").fill("not-an-email");
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog.getByText("That email address isn't valid.")).toBeVisible();
    await dialog.getByLabel("Email").fill("someone@gym-arena.local");
    await dialog.getByLabel("Temporary password").fill("short");
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog.getByText("The password must be at least 10 characters.")).toBeVisible();
    // show / hide password
    await expect(dialog.getByLabel("Temporary password")).toHaveAttribute("type", "password");
    await dialog.getByRole("button", { name: "Show password" }).click();
    await expect(dialog.getByLabel("Temporary password")).toHaveAttribute("type", "text");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("BR-P7: a coach with active clients cannot be deactivated (UI explains; database decides)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await openCoaches(page, "ar");
    await page.getByRole("button", { name: "إيقاف حساب Coach Omar" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "لا يمكن إيقاف الحساب الآن" })).toBeVisible();
    await expect(dialog.getByText(/يجب نقلهم إلى مدرب آخر أولًا/)).toBeVisible();
    await expect(dialog.getByText("انقل العملاء إلى مدرب آخر من صفحة الأعضاء، ثم أعد المحاولة.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "فتح صفحة الأعضاء" })).toHaveAttribute("href", `/admin/members?coach=${COACH1}`);
    await expect(dialog.getByRole("button", { name: "إيقاف الحساب" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // the server refuses too, and nothing changes
    const r = await page.request.patch(`/api/coaches/${COACH1}`, { data: { is_active: false } });
    expect(r.status()).toBe(403);
    expect((await r.json()).error.reason).toBe("has_active_clients");
    const { coaches } = await (await page.request.get("/api/coaches")).json();
    expect(coaches.find((c: { id: string }) => c.id === COACH1)).toMatchObject({ is_active: true, sign_in_blocked: false });
  });

  test("API: admin only; admins cannot be targeted; inputs are strict", async ({ page }) => {
    expect((await page.request.patch(`/api/coaches/${ADMIN}`, { data: { is_active: false } })).status()).toBe(404);
    expect((await page.request.patch("/api/coaches/not-a-uuid", { data: { full_name: "x" } })).status()).toBe(404);
    let r = await page.request.post("/api/coaches", { data: { full_name: "X", email: "x@gym-arena.local", password: "123" } });
    expect((await r.json()).error.reason).toBe("password_too_short");
    r = await page.request.post("/api/coaches", { data: { full_name: "X", email: "x@gym-arena.local", password: "long-enough-1", role: "admin" } });
    expect(r.status()).toBe(422);
    r = await page.request.post("/api/coaches", { data: { full_name: "Dup", email: "coach1@gym-arena.local", password: "long-enough-1" } });
    expect((await r.json()).error.reason).toBe("email_taken");
    expect(JSON.stringify(await (await page.request.get("/api/coaches")).json())).not.toMatch(/password/i);

    await page.context().clearCookies();
    await signIn(page, "coach1@gym-arena.local");
    await expect(page).toHaveURL(/\/today$/);
    expect((await page.request.get("/api/coaches")).status()).toBe(403);
    expect((await page.request.patch(`/api/coaches/${COACH1}`, { data: { full_name: "Me" } })).status()).toBe(403);
    await page.goto("/admin/coaches");
    await expect(page).toHaveURL(/\/today$/);
  });

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    for (const locale of ["ar", "en"] as const) {
      test(`layout fits ${name} (${locale})`, async ({ page }) => {
        await page.setViewportSize(vp);
        await openCoaches(page, locale);
        for (const button of await page.getByRole("main").getByRole("button").all()) {
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await page.getByRole("button", { name: locale === "ar" ? "مدرب جديد" : "New coach" }).click();
        const box = (await page.getByRole("dialog").boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
      });
    }
  }

  test.describe("coach lifecycle @writes", () => {
    const COPY = {
      en: { new: "New coach", name: "Full name", email: "Email", password: "Temporary password", create: "Create account", created: "Coach account created",
            deactivate: "Deactivate", rowDeactivate: "Deactivate", rowReactivate: "Reactivate", deactivated: "Account deactivated and signed out", blocked: "Can't deactivate yet", reactivate: "Reactivate",
            reactivated: "Account reactivated", inactive: "Account inactive — contact the admin", statusInactive: "Inactive" },
      ar: { new: "مدرب جديد", name: "الاسم الكامل", email: "البريد الإلكتروني", password: "كلمة مرور مؤقتة", create: "إنشاء الحساب", created: "تم إنشاء حساب المدرب",
            deactivate: "إيقاف الحساب", rowDeactivate: "إيقاف حساب", rowReactivate: "إعادة تفعيل", deactivated: "تم إيقاف الحساب وإنهاء جلساته", blocked: "لا يمكن إيقاف الحساب الآن", reactivate: "إعادة التفعيل",
            reactivated: "تمت إعادة تفعيل الحساب", inactive: "الحساب غير مفعّل — تواصل مع الإدارة", statusInactive: "غير نشط" },
    } as const;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const opts = { auth: { persistSession: false, autoRefreshToken: false } };
    const supa = async (email: string, password: string) => {
      const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", opts);
      const { error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return c;
    };
    const service = () => createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", opts);

    async function coachContext(browser: Browser, locale: "ar" | "en") {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.phone });
      const p = await ctx.newPage();
      await p.request.post("/api/locale", { data: { locale } });
      return { ctx, p };
    }

    for (const locale of ["en", "ar"] as const) {
      test(`create → sign in → blocked while clients → deactivate → sessions rejected → history kept → reactivate (${locale})`, async ({ page, browser }) => {
        test.setTimeout(120_000);
        requireWriteTarget(); // only ever a verified test stack (fail closed)
        const c = COPY[locale];
        const stamp = `${Date.now()}`.slice(-7);
        const email = `coach.${locale}.${stamp}@gym-arena.local`;
        const fullName = `E2E Coach ${locale} ${stamp}`;
        const password = `Temp-pass-${stamp}`;

        // 1. admin creates the coach
        await page.setViewportSize(VIEWPORTS.ipad);
        await openCoaches(page, locale);
        await page.getByRole("button", { name: c.new }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel(c.name).fill(fullName);
        await dialog.getByLabel(c.email).fill(email);
        await dialog.getByLabel(c.password).fill(password);
        await dialog.getByRole("button", { name: c.create }).click();
        await expect(page.getByRole("status").filter({ hasText: c.created })).toBeVisible();
        const row = page.getByRole("listitem").filter({ hasText: fullName });
        await expect(row.getByText(email)).toBeVisible();
        const { coaches } = await (await page.request.get("/api/coaches")).json();
        const created = coaches.find((x: { email: string }) => x.email === email);
        expect(created).toMatchObject({ is_active: true, sign_in_blocked: false, active_clients: 0 });

        // 2. the coach signs in on their phone and works: registers a client, logs a result
        const coach = await coachContext(browser, locale);
        await signIn(coach.p, email, password);
        await expect(coach.p).toHaveURL(/\/today$/);
        // the coach's own language preference (profile) decides the messages they see
        expect((await coach.p.request.post("/api/locale", { data: { locale } })).status()).toBe(200);
        const coachDb = await supa(email, password);
        const { data: member, error: memberError } = await coachDb.from("members")
          .insert({ full_name: `Client of ${stamp}`, phone: `+20115${stamp.padStart(7, "0")}`.slice(0, 13), coach_id: created.id }).select().single();
        expect(memberError).toBeNull();
        const { data: entry, error: entryError } = await service().rpc("server_log_entry", {
          p_actor: created.id, p_member_id: member.id, p_category: "treadmill", p_km: 3,
        });
        expect(entryError).toBeNull();

        // 3. BR-P7: deactivation is blocked while the coach has an active client
        await page.reload();
        await page.getByRole("button", { name: `${c.rowDeactivate} ${fullName}`, exact: true }).click();
        await expect(page.getByRole("dialog").getByRole("heading", { name: c.blocked })).toBeVisible();
        await page.keyboard.press("Escape");

        // the client is reassigned (Members workflow, M2 step 4 — done directly here)
        const adminDb = await supa("admin@gym-arena.local", PASSWORD);
        expect((await adminDb.from("members").update({ coach_id: COACH1 }).eq("id", member.id)).error).toBeNull();
        const auditBefore = (await adminDb.from("audit_log").select("id", { count: "exact", head: true })).count ?? 0;

        // 4. deactivate
        await page.reload();
        await page.getByRole("button", { name: `${c.rowDeactivate} ${fullName}`, exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: c.deactivate }).click();
        await expect(page.getByRole("status").filter({ hasText: c.deactivated })).toBeVisible();
        await expect(page.getByRole("listitem").filter({ hasText: fullName }).getByText(c.statusInactive, { exact: true })).toBeVisible();

        // both systems agree: profile inactive AND Auth ban in force
        const { data: authUser } = await service().auth.admin.getUserById(created.id);
        expect(new Date(authUser.user!.banned_until!).getTime()).toBeGreaterThan(Date.now());
        const { data: profile } = await adminDb.from("profiles").select("is_active").eq("id", created.id).single();
        expect(profile!.is_active).toBe(false);

        // 5. AC-49: the coach's already-open session is rejected on the very next request
        await coach.p.goto("/today");
        await expect(coach.p).toHaveURL(/\/login\?error=inactive$/);
        await expect(coach.p.locator("form [role=alert]")).toHaveText(c.inactive);
        expect((await coach.p.request.get("/api/me")).status()).toBe(401);
        // …and directly against the database with the old token
        const { data: visible } = await coachDb.from("members").select("id");
        expect(visible ?? []).toHaveLength(0);

        // AC-48: a fresh sign-in is refused with "Account inactive"
        await signIn(coach.p, email, password);
        await expect(coach.p.locator("form [role=alert]")).toHaveText(c.inactive);

        // 6. AC-50: history preserved — the entry and audit trail are unchanged
        const { data: kept } = await adminDb.from("entries").select("id, logged_by, voided_at").eq("id", entry.id).single();
        expect(kept).toEqual({ id: entry.id, logged_by: created.id, voided_at: null });
        const { data: audit } = await adminDb.from("audit_log").select("action, actor_id").eq("entity_id", created.id);
        expect(audit).toContainEqual({ action: "coach.deactivate", actor_id: ADMIN });
        const auditAfter = (await adminDb.from("audit_log").select("id", { count: "exact", head: true })).count ?? 0;
        expect(auditAfter).toBe(auditBefore + 1); // only the deactivation row was added

        // 7. reactivate → the coach can sign in again
        await page.getByRole("button", { name: `${c.rowReactivate} ${fullName}`, exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: c.reactivate }).click();
        await expect(page.getByRole("status").filter({ hasText: c.reactivated })).toBeVisible();
        const { data: after } = await service().auth.admin.getUserById(created.id);
        expect(after.user!.banned_until ?? null).toBeFalsy();
        await signIn(coach.p, email, password);
        await expect(coach.p).toHaveURL(/\/today$/);
        await coach.ctx.close();
      });
    }
  });
});
