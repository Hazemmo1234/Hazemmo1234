import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LOCAL_ONLY, expectLanguage, requireWriteTarget, signIn } from "./helpers";

// M3 coach workflow (UX C2–C5): Today, member card, entry sheet, photo rule, undo,
// attendance and the activity log — real UI, real API, real database (no mocks).
const VIEWPORTS = { phone: { width: 390, height: 844 }, ipad: { width: 820, height: 1180 } };
/** AC-32: every coach screen usable at 360 px wide */
const LAYOUTS = { narrow: { width: 360, height: 740 }, ...VIEWPORTS };
const COACH2_CLIENT = "00000000-0000-4000-c000-000000000001"; // seed i=1 → coach 2
const tinyWebp = () => Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");

const C = {
  en: {
    today: "Today", activity: "Activity", search: "Search clients", add: "Add client", fullName: "Full name", phone: "Mobile",
    register: "Register member", registered: "Member registered", logged: "Logged today", km: "Distance (km)", save: "Save",
    photoRequired: "Photo required — take photo", photoReady: "Photo ready", plus: "+29 pts", saved: "+29 pts · Total 29",
    noChange: "Recorded — no points change", savedNoPoints: "Saved · Total 29", increase: "One more", todayEntries: "Today's entries",
    undo: "Undo", undoConfirm: "Undo entry", undone: "Entry undone", undoneBadge: "Undone", markAttended: "Mark attended today",
    attendedToday: "Attended today", attendedToast: "Attendance recorded", showUndone: /^Show \d+ undone entr/, noResults: "No clients match.",
  },
  ar: {
    today: "اليوم", activity: "النشاط", search: "ابحث عن عميل", add: "إضافة عميل", fullName: "الاسم الكامل", phone: "رقم الموبايل",
    register: "تسجيل العضو", registered: "تم تسجيل العضو", logged: "سُجِّل اليوم", km: "المسافة (كم)", save: "حفظ",
    photoRequired: "الصورة مطلوبة — التقط صورة", photoReady: "الصورة جاهزة", plus: "+29 نقطة", saved: "+29 نقطة · الإجمالي 29",
    noChange: "سُجِّلت — بدون تغيير في النقاط", savedNoPoints: "تم الحفظ · الإجمالي 29", increase: "أكثر بواحد", todayEntries: "نتائج اليوم",
    undo: "تراجع", undoConfirm: "تراجع عن النتيجة", undone: "تم التراجع عن النتيجة", undoneBadge: "تم التراجع", markAttended: "تسجيل حضور اليوم",
    attendedToday: "حضر اليوم", attendedToast: "تم تسجيل الحضور", showUndone: /^عرض .*تم التراجع/, noResults: "لا يوجد عملاء مطابقون.",
  },
} as const;

async function asCoach(page: Page, locale: "ar" | "en", email = "coach1@gym-arena.local") {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/today$/);
  await page.request.post("/api/locale", { data: { locale } });
  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  await expectLanguage(page, locale);
}
const rows = (page: Page) => page.getByRole("main").getByRole("list").first().getByRole("listitem");
const status = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

test.describe("coach workflow", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "viewports are set per test; run once");
  });
  test.afterEach(async ({ page }) => {
    await page.request.post("/api/locale", { data: { locale: "ar" } });
  });

  test("Today lists exactly the coach's own active clients; search narrows it", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await asCoach(page, "en");
    const { members } = await (await page.request.get("/api/members?status=active")).json();
    expect(members.length).toBeGreaterThan(0);
    await expect(rows(page)).toHaveCount(members.length);
    await expect(page.getByRole("navigation", { name: "Coach navigation" }).getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");

    const name = members[0].full_name as string;
    await page.getByPlaceholder(C.en.search).fill(name);
    await expect(rows(page).first()).toContainText(name);
    expect(await rows(page).count()).toBeLessThanOrEqual(members.filter((m: { full_name: string }) => m.full_name.toLowerCase().includes(name.toLowerCase())).length);
    await page.getByPlaceholder(C.en.search).fill("zz-no-such-client");
    await expect(page.getByText(C.en.noResults)).toBeVisible();
  });

  // The "Add client" action lives in the search toolbar: a floating button used to cover the
  // second client's points on phones. No control may overlap a client row, before or after
  // scrolling; the seven dots have a legend.
  for (const locale of ["ar", "en"] as const) {
    test(`Today: Add client never covers a client row; dots have a legend (${locale}, phone)`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.phone);
      await asCoach(page, locale);
      await expect(page.getByTestId("dots-legend")).toBeVisible();
      const add = page.getByRole("main").getByRole("button", { name: C[locale].add });
      await expect(add).toBeVisible();
      // at rest: no client row is under the button
      const a = (await add.boundingBox())!;
      for (const row of await rows(page).all()) {
        const r = (await row.boundingBox())!;
        const intersect = a.x < r.x + r.width && r.x < a.x + a.width && a.y < r.y + r.height && r.y < a.y + a.height;
        expect(intersect, `Add client covers "${(await row.textContent())!.slice(0, 24)}"`).toBe(false);
      }
      // scrolled: the button stays inside the opaque toolbar pinned to the top edge, never over
      // the middle of the list (rows pass under the whole toolbar, like under a header)
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(300);
      const bar = (await page.getByTestId("today-toolbar").boundingBox())!;
      const b = (await add.boundingBox())!;
      expect(bar.y).toBeLessThanOrEqual(1);
      expect(b.y).toBeGreaterThanOrEqual(bar.y);
      expect(b.y + b.height).toBeLessThanOrEqual(bar.y + bar.height + 0.5);
    });
  }

  test("member card: seven tiles, today's entries; another coach's client is not found", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.ipad);
    await asCoach(page, "ar");
    await rows(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/members\/[0-9a-f-]{36}$/);
    const tiles = page.getByRole("region", { name: "الفئات" });
    for (const name of ["Deadlift", "Bench Press", "Squat", "Pull-ups", "Push-ups", "Treadmill"]) {
      await expect(tiles.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await expect(tiles.getByText("الالتزام")).toBeVisible();
    await expect(page.getByRole("heading", { name: C.ar.todayEntries })).toBeVisible();
    await expectLanguage(page, "ar");

    const res = await page.goto(`/members/${COACH2_CLIENT}`);
    expect(res!.status()).toBe(404);
    await expect(page.getByText("GA-000001")).toHaveCount(0); // nothing about the other coach's client leaks
  });

  for (const [vpName, vp] of Object.entries(LAYOUTS)) {
    for (const locale of ["ar", "en"] as const) {
      test(`layout fits ${vpName} (${locale}): Today, card and entry sheet`, async ({ page }) => {
        await page.setViewportSize(vp);
        await asCoach(page, locale);
        for (const button of await page.getByRole("main").getByRole("button").all()) {
          if (await button.isVisible()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await rows(page).first().getByRole("link").click();
        await page.waitForLoadState("networkidle");
        await expectLanguage(page, locale);
        const open = page.getByRole("main").getByRole("button", { name: /^(Deadlift|Bench Press|Squat|Pull-ups|Push-ups|Treadmill)$/ }).first();
        if (await open.count()) {
          await open.click();
          const box = (await page.getByRole("dialog").boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
          await page.keyboard.press("Escape");
        }
        await page.goto("/today/activity");
        await expectLanguage(page, locale);
      });
    }
  }

  test.describe("daily journey @writes", () => {
    test.beforeEach(() => {
      requireWriteTarget(); // per-test check on top of the central global setup
    });
    for (const [locale, vpName] of [["en", "phone"], ["ar", "ipad"]] as const) {
      test(`add client → photo-required result → save → log → undo → activity (${locale}, ${vpName})`, async ({ page }) => {
        test.setTimeout(120_000);
        const c = C[locale];
        await page.setViewportSize(VIEWPORTS[vpName]);
        await asCoach(page, locale);
        const stamp = `${Date.now()}`.slice(-7);
        const name = `Journey ${locale} ${stamp}`;

        // 1. register a client from Today (shared Member Form; the coach is assigned automatically)
        await page.getByRole("button", { name: c.add }).click();
        let dialog = page.getByRole("dialog");
        await dialog.getByLabel(c.fullName).fill(name);
        await dialog.getByLabel(c.phone).fill(`0122${stamp}`);
        await dialog.getByRole("button", { name: c.register }).click();
        await expect(status(page, c.registered)).toBeVisible();
        await page.getByPlaceholder(c.search).fill(name);
        await expect(rows(page)).toHaveCount(1);

        // 2. open the card, log a treadmill result: the preview shows the points and demands a photo
        await rows(page).first().getByRole("link").click();
        await expect(page.getByRole("heading", { name })).toBeVisible();
        await page.getByRole("button", { name: /^Treadmill/ }).click();
        dialog = page.getByRole("dialog");
        await dialog.getByLabel(c.km).fill("3");
        await expect(dialog.getByText(c.plus)).toBeVisible();
        await expect(dialog.getByRole("button", { name: c.photoRequired })).toBeVisible();
        await expect(dialog.getByRole("button", { name: c.save })).toBeDisabled(); // photo rule (SCORING §6)
        await dialog.locator('input[type="file"]').setInputFiles({ name: "proof.webp", mimeType: "image/webp", buffer: tinyWebp() });
        await expect(dialog.getByText(c.photoReady)).toBeVisible();
        await dialog.getByRole("button", { name: c.save }).click();
        await expect(status(page, c.saved)).toBeVisible();
        await expect(page.getByRole("button", { name: new RegExp(`^Treadmill — ${c.logged}`) })).toBeDisabled();
        await expect(page.getByRole("button", { name: c.attendedToday })).toBeDisabled(); // auto attendance (BR-E7)

        // 3. a second result that earns nothing (rookie) needs no photo
        await page.getByRole("button", { name: /^Pull-ups$/ }).click();
        dialog = page.getByRole("dialog");
        for (let i = 0; i < 3; i++) await dialog.getByRole("button", { name: c.increase }).click();
        await expect(dialog.getByText(c.noChange)).toBeVisible();
        await dialog.getByRole("button", { name: c.save }).click();
        await expect(status(page, c.savedNoPoints)).toBeVisible();

        // 4. today's entries → undo the pull-ups (own entry, same day)
        const entries = page.getByRole("heading", { name: c.todayEntries }).locator("xpath=..");
        await expect(entries.getByRole("listitem")).toHaveCount(2);
        await entries.getByRole("listitem").filter({ hasText: "Pull-ups" }).getByRole("button", { name: c.undo }).click();
        await page.getByRole("dialog").getByRole("button", { name: c.undoConfirm }).click();
        await expect(status(page, c.undone)).toBeVisible();
        await expect(entries.getByRole("listitem").filter({ hasText: "Pull-ups" }).getByText(c.undoneBadge)).toBeVisible();
        await expect(page.getByRole("button", { name: /^Pull-ups$/ })).toBeEnabled(); // can be logged again

        // 5. the activity log shows the client's results; the undone one behind a toggle
        await page.getByRole("navigation").getByRole("link", { name: c.activity }).click();
        await expect(page).toHaveURL(/\/today\/activity$/);
        const mine = page.getByRole("main").getByRole("listitem").filter({ hasText: name });
        await expect(mine).toHaveCount(1);
        await expect(mine).toContainText("Treadmill");
        await page.getByRole("button", { name: c.showUndone }).click();
        await expect(mine).toHaveCount(2);

        // 6. back on Today the client is marked as logged today
        await page.getByRole("navigation").getByRole("link", { name: c.today }).click();
        await page.getByPlaceholder(c.search).fill(name);
        await expect(rows(page).first()).toContainText(c.logged);
        await expectLanguage(page, locale);
      });
    }

    test("attendance without a result (en, phone)", async ({ page }) => {
      const c = C.en;
      await page.setViewportSize(VIEWPORTS.phone);
      await asCoach(page, "en");
      const created = await page.request.post("/api/members", { data: { full_name: `Attend UI ${Date.now() % 100000}`, phone: `+20100${String(Date.now()).slice(-7)}` } });
      expect(created.status()).toBe(201);
      const { member } = await created.json();
      await page.goto(`/members/${member.id}`);
      await page.getByRole("button", { name: c.markAttended }).click();
      await expect(status(page, c.attendedToast)).toBeVisible();
      await expect(page.getByRole("button", { name: c.attendedToday })).toBeDisabled();
    });
  });
});
