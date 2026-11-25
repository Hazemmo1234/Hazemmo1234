import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LOCAL_ONLY, expectLanguage, motionSettled, requireWriteTarget, signIn } from "./helpers";

// UX A3 Members (M2): list, filters, detail panel, and the admin workflows in both languages.
const VIEWPORTS = { phone: { width: 360, height: 780 }, phone390: { width: 390, height: 844 }, ipad: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };

/**
 * Tap targets (AC-32: ≥ 44 px) for EVERY visible button in the main area, measured in one
 * pass inside the page — one round trip for any number of rows. Returns the offenders.
 */
async function smallTapTargets(page: Page, selector = "main button") {
  return page.evaluate((sel) => {
    const out: string[] = [];
    let measured = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      measured++;
      if (r.height < 44) out.push(`${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}: ${Math.round(r.height)}px`);
    }
    return { measured, offenders: out };
  }, selector);
}
const COACH1 = "00000000-0000-4000-a000-000000000011";
const COACH2 = "00000000-0000-4000-a000-000000000012";
const tinyWebp = () => Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");

async function openMembers(page: Page, locale: "ar" | "en", query = "") {
  await page.request.post("/api/locale", { data: { locale } });
  await page.goto(`/admin/members${query}`);
  await page.waitForLoadState("networkidle");
  await expectLanguage(page, locale);
}
const row = (page: Page, text: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: text });

test.describe("members", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "viewports are set per test; run once");
    await signIn(page, "admin@gym-arena.local");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
  test.afterEach(async ({ page }) => {
    await page.request.post("/api/locale", { data: { locale: "ar" } });
  });

  test("list shows code, formatted mobile, coach and status; nav entry is live", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await openMembers(page, "en");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Members" })).toHaveAttribute("href", "/admin/members");
    const first = row(page, "GA-000001");
    await expect(first).toHaveCount(1);
    await expect(first.getByText("010 1000 0001")).toBeVisible();
    await expect(first.getByText("Active", { exact: true })).toBeVisible();
    await expect(row(page, "GA-000039").getByText("Inactive", { exact: true })).toBeVisible();
  });

  test("filters: status, coach (linkable URL), rookies, search by mobile digits, empty results", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await openMembers(page, "en", "?status=inactive");
    // the seed's inactive members are listed, and every listed row is inactive
    // (independent of how many inactive members earlier test runs left behind)
    await expect(row(page, "GA-000039")).toHaveCount(1);
    await expect(row(page, "GA-000040")).toHaveCount(1);
    const rows = page.getByRole("main").getByRole("listitem");
    await expect(rows.filter({ hasText: "Inactive" })).toHaveCount(await rows.count());

    await openMembers(page, "en", `?coach=${COACH1}`);
    const { members } = await (await page.request.get(`/api/members?coach_id=${COACH1}`)).json();
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(members.length);
    expect(members.every((m: { coach_id: string }) => m.coach_id === COACH1)).toBe(true);

    await openMembers(page, "en", "?rookie=1");
    for (const code of ["GA-000034", "GA-000035", "GA-000036", "GA-000037", "GA-000038"]) {
      await expect(row(page, code).getByText("Rookie", { exact: true })).toBeVisible();
    }
    await expect(row(page, "GA-000001")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rookies only" })).toHaveAttribute("aria-pressed", "true");

    await openMembers(page, "en");
    await page.getByRole("searchbox").fill("0101 000 0039");
    await expect(page).toHaveURL(/q=0101/);
    await expect(row(page, "GA-000039")).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(1);

    await page.getByRole("searchbox").fill("no-such-member-xyz");
    await expect(page.getByText("No results")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(row(page, "GA-000001")).toHaveCount(1);
  });

  test("detail panel: profile, plan and coach history (Arabic)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.ipad);
    await openMembers(page, "ar");
    await row(page, "GA-000001").getByRole("button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("GA-000001")).toBeVisible();
    await expect(dialog.getByText("010 1000 0001")).toBeVisible();
    await expect(dialog.getByText("12 حصة")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "سجل المدربين" })).toBeVisible();
    await expect(dialog.getByText("حتى الآن")).toBeVisible();
    for (const name of ["إيقاف العضو", "نقل لمدرب آخر", "تعديل"]) await expect(dialog.getByRole("button", { name })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("create dialog validates on the client; admin must choose a coach", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await openMembers(page, "en");
    await page.getByRole("button", { name: "New member" }).click();
    const dialog = page.getByRole("dialog", { name: "New member" });
    await dialog.getByRole("button", { name: "Register member" }).click();
    await expect(dialog.getByText("Enter the member's name.")).toBeVisible();
    await dialog.getByLabel("Full name").fill("Validation Only");
    await dialog.getByLabel("Mobile").fill("12345");
    await dialog.getByRole("button", { name: "Register member" }).click();
    await expect(dialog.getByText("That isn't a valid Egyptian mobile number.")).toBeVisible();
    await dialog.getByLabel("Mobile").fill("٠١٠ ١٢٣٤ ٥٦٧٨"); // Arabic-Indic digits are accepted
    await dialog.getByRole("button", { name: "Register member" }).click();
    await expect(dialog.getByText("Choose a coach.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("coaches cannot open the admin Members page", async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, "coach1@gym-arena.local");
    await expect(page).toHaveURL(/\/today$/);
    await page.goto("/admin/members");
    await expect(page).toHaveURL(/\/today$/);
  });

  // Layout and tap targets on a deterministic list: ?q=GA-00000 is always exactly the seed's
  // GA-000001 … GA-000009, whatever else a busy test stack holds. Every button is checked.
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    for (const locale of ["ar", "en"] as const) {
      test(`layout fits ${name} (${locale})`, async ({ page }) => {
        await page.setViewportSize(vp);
        await openMembers(page, locale, "?q=GA-00000");
        await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(9);
        // phones fold the coach / status / rookie filters behind one button: open it like a user
        // would, so the filter controls are measured too
        const filtersToggle = page.locator('button[aria-controls="member-filters"]');
        if (await filtersToggle.isVisible()) {
          await filtersToggle.click();
          await expect(page.locator("#member-filters")).toBeVisible();
        }
        await motionSettled(page);
        const taps = await smallTapTargets(page);
        expect(taps.measured).toBeGreaterThanOrEqual(9 + 3); // every row + the filter controls
        expect(taps.offenders).toEqual([]);
        // the table header is desktop-only; phone/iPad use stacked rows
        await expect(page.getByRole("main").getByText(locale === "ar" ? "الكود" : "Code", { exact: true })).toBeVisible({ visible: vp.width >= 1024 });
        await row(page, "GA-000001").getByRole("button").click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await motionSettled(page);
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
        expect((await smallTapTargets(page, "dialog button")).offenders).toEqual([]);
        await expectLanguage(page, locale);
      });
    }
  }

  // Large list: the Members list has no pagination (M2 behaviour), so EVERY member must be
  // rendered — nothing silently cut — and stay usable. On the busy test stack this is ~1000
  // rows; on CI's fresh stack it is the seed. The invariant (rendered = API) holds at any size.
  for (const [name, vp] of [["phone", VIEWPORTS.phone], ["desktop", VIEWPORTS.desktop]] as const) {
    test(`full list renders every member and stays usable (${name})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(vp);
      await openMembers(page, "ar");
      // ground truth from the database itself, NOT from the API under test (an API cut at the
      // 1000-row limit would otherwise "agree" with a list cut the same way)
      const truth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
      const { count, error } = await truth.from("members").select("id", { count: "exact", head: true });
      expect(error).toBeNull();
      const { members } = await (await page.request.get("/api/members")).json();
      expect(members.length).toBe(count); // the API returns every member
      const rows = page.getByRole("main").getByRole("listitem");
      await expect(rows).toHaveCount(count!);
      const taps = await smallTapTargets(page, "main li button");
      expect(taps.measured).toBe(count);
      expect(taps.offenders).toEqual([]);
      await expectLanguage(page, "ar"); // includes: no horizontal overflow
      // the last row is reachable and opens its detail like the first
      const last = rows.last();
      await last.scrollIntoViewIfNeeded();
      await last.getByRole("button").click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });
  }

  test.describe("member lifecycle @writes", () => {
    const C = {
      en: { new: "New member", name: "Full name", phone: "Mobile", coach: "Coach", consent: "Client agrees to show their photo on the gym TV", create: "Register member",
            created: "Member registered", edit: "Edit", save: "Save", updated: "Changes saved", reassign: "Reassign coach", newCoach: "New coach", reassigned: "Member reassigned",
            deactivate: "Deactivate", deactivated: "Member deactivated", reactivate: "Reactivate", reactivated: "Member reactivated", needsCoach: "Their previous coach is inactive",
            coachRequired: "Choose a coach.", rowDeactivate: "Deactivate", blocked: "Can't deactivate yet", openMembers: "Open Members", coachDeactivate: "Deactivate", coachDone: "Account deactivated and signed out", present: "present" },
      ar: { new: "عضو جديد", name: "الاسم الكامل", phone: "رقم الموبايل", coach: "المدرب", consent: "العميل يوافق على عرض صورته على شاشة الجيم", create: "تسجيل العضو",
            created: "تم تسجيل العضو", edit: "تعديل", save: "حفظ", updated: "تم حفظ التغييرات", reassign: "نقل لمدرب آخر", newCoach: "المدرب الجديد", reassigned: "تم نقل العضو",
            deactivate: "إيقاف العضو", deactivated: "تم إيقاف العضو", reactivate: "إعادة التفعيل", reactivated: "تمت إعادة تفعيل العضو", needsCoach: "مدربه السابق غير نشط",
            coachRequired: "اختر المدرب.", rowDeactivate: "إيقاف حساب", blocked: "لا يمكن إيقاف الحساب الآن", openMembers: "فتح صفحة الأعضاء", coachDeactivate: "إيقاف الحساب", coachDone: "تم إيقاف الحساب وإنهاء جلساته", present: "حتى الآن" },
    } as const;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const service = () => createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });

    for (const locale of ["en", "ar"] as const) {
      test(`register with photo → edit → coach blocked → Members link → reassign → deactivate → coach deactivated → reactivate needs a coach (${locale})`, async ({ page }) => {
        test.setTimeout(150_000);
        requireWriteTarget(); // only ever a verified test stack (fail closed)
        const c = C[locale];
        const stamp = `${Date.now()}`.slice(-7);
        const coachName = `E2E Owner ${locale} ${stamp}`;
        const memberName = `E2E Member ${locale} ${stamp}`;
        const r = await page.request.post("/api/coaches", { data: { full_name: coachName, email: `owner.${locale}.${stamp}@gym-arena.local`, password: `Temp-pass-${stamp}` } });
        expect(r.status()).toBe(201);
        const coachId = (await r.json()).coach.id as string;

        // 1. register through the shared Member Form, with a photo
        await page.setViewportSize(VIEWPORTS.ipad);
        await openMembers(page, locale);
        await page.getByRole("button", { name: c.new }).click();
        let dialog = page.getByRole("dialog");
        await dialog.getByLabel(c.name).fill(memberName);
        await dialog.getByLabel(c.phone).fill(`0115${stamp}`);
        await dialog.getByLabel(c.coach).selectOption(coachId);
        await dialog.getByLabel(c.consent).check();
        await dialog.locator('input[type="file"]').setInputFiles({ name: "p.webp", mimeType: "image/webp", buffer: tinyWebp() });
        await dialog.getByRole("button", { name: c.create }).click();
        await expect(page.getByRole("status").filter({ hasText: c.created })).toBeVisible();
        const { members } = await (await page.request.get(`/api/members?coach_id=${coachId}`)).json();
        expect(members).toHaveLength(1);
        const m = members[0];
        expect(m).toMatchObject({ full_name: memberName, phone: `+20115${stamp}`, photo_consent: true, status: "active" });
        expect(members[0].photo_url).toBeTruthy();
        await expect(row(page, memberName).locator("img")).toHaveCount(1);

        // 2. edit the name
        await row(page, memberName).getByRole("button").click();
        await page.getByRole("dialog").getByRole("button", { name: c.edit }).click();
        dialog = page.getByRole("dialog");
        await dialog.getByLabel(c.name).fill(`${memberName} X`);
        await dialog.getByRole("button", { name: c.save }).click();
        await expect(page.getByRole("status").filter({ hasText: c.updated })).toBeVisible();
        await expect(row(page, `${memberName} X`)).toHaveCount(1);

        // second client of the same coach, deactivated directly: reactivated later (decision 5)
        const second = await page.request.post("/api/members", { data: { full_name: `${memberName} B`, phone: `0128${stamp}`, coach_id: coachId } });
        const secondId = (await second.json()).member.id as string;
        expect((await page.request.post(`/api/members/${secondId}/status`, { data: { status: "inactive" } })).status()).toBe(200);

        // 3. the coach can't be deactivated yet → the dialog links to their filtered Members
        await page.goto("/admin/coaches");
        await page.getByRole("button", { name: `${c.rowDeactivate} ${coachName}`, exact: true }).click();
        await expect(page.getByRole("dialog").getByRole("heading", { name: c.blocked })).toBeVisible();
        await page.getByRole("dialog").getByRole("link", { name: c.openMembers }).click();
        await expect(page).toHaveURL(new RegExp(`/admin/members\\?coach=${coachId}$`));
        await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(2);

        // 4. reassign the active client
        await row(page, `${memberName} X`).getByRole("button").click();
        await page.getByRole("dialog").getByRole("button", { name: c.reassign }).click();
        dialog = page.getByRole("dialog");
        await expect(dialog.getByLabel(c.newCoach).locator(`option[value="${coachId}"]`)).toHaveCount(0); // not the current coach
        await dialog.getByLabel(c.newCoach).selectOption(COACH1);
        await dialog.getByRole("button", { name: c.reassign }).click();
        await expect(page.getByRole("status").filter({ hasText: c.reassigned })).toBeVisible();
        await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(1); // filter still on the old coach
        const { data: history } = await service().from("coach_assignments").select("coach_id, ended_at").eq("member_id", m.id).order("started_at");
        expect(history!.map((h) => [h.coach_id, h.ended_at === null])).toEqual([[coachId, false], [COACH1, true]]);

        // 5. deactivate it from the detail panel (history is shown with both coaches)
        await page.goto(`/admin/members?q=${encodeURIComponent(`${memberName} X`)}`);
        await row(page, `${memberName} X`).getByRole("button").click();
        await expect(page.getByRole("dialog").getByText(coachName)).toBeVisible();
        await expect(page.getByRole("dialog").getByText(c.present)).toHaveCount(1);
        await page.getByRole("dialog").getByRole("button", { name: c.deactivate }).click();
        await page.getByRole("dialog").getByRole("button", { name: c.deactivate }).click();
        await expect(page.getByRole("status").filter({ hasText: c.deactivated })).toBeVisible();

        // 6. now the coach has no active clients and can be deactivated
        await page.goto("/admin/coaches");
        await page.getByRole("button", { name: `${c.rowDeactivate} ${coachName}`, exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: c.coachDeactivate }).click();
        await expect(page.getByRole("status").filter({ hasText: c.coachDone })).toBeVisible();

        // 7. reactivating the second client requires choosing an active coach
        await openMembers(page, locale, `?status=inactive&q=${encodeURIComponent(`${memberName} B`)}`);
        await row(page, `${memberName} B`).getByRole("button").click();
        await page.getByRole("dialog").getByRole("button", { name: c.reactivate }).click();
        dialog = page.getByRole("dialog");
        await expect(dialog.getByText(new RegExp(c.needsCoach))).toBeVisible();
        await expect(dialog.getByLabel(c.coach)).toHaveValue("");
        await dialog.getByRole("button", { name: c.reactivate }).click();
        await expect(dialog.getByText(c.coachRequired)).toBeVisible();
        await dialog.getByLabel(c.coach).selectOption(COACH2);
        await dialog.getByRole("button", { name: c.reactivate }).click();
        await expect(page.getByRole("status").filter({ hasText: c.reactivated })).toBeVisible();
        const { data: back } = await service().from("members").select("status, coach_id").eq("id", secondId).single();
        expect(back).toEqual({ status: "active", coach_id: COACH2 });
        await expectLanguage(page, locale);
      });
    }
  });
});
