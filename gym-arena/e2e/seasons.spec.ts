import { expect, test, type Page } from "@playwright/test";
import { LOCAL_ONLY, expectLanguage, requireWriteTarget, signIn } from "./helpers";

// UX A2 Seasons (M2). Read-only and rejected-write tests run anywhere; tests that create
// or change rows are tagged @writes and run only on a disposable database.
const VIEWPORTS = { phone: { width: 360, height: 780 }, ipad: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };

async function openSeasons(page: Page, locale: "ar" | "en" = "ar") {
  await page.request.post("/api/locale", { data: { locale } });
  await page.goto("/admin/seasons");
  await page.waitForLoadState("networkidle");
  await expectLanguage(page, locale);
}

test.describe("seasons", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "viewports are set per test; run once");
    await signIn(page, "admin@gym-arena.local");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
  test.afterEach(async ({ page }) => {
    await page.request.post("/api/locale", { data: { locale: "ar" } });
  });

  test("list shows live statuses; closed seasons are read-only", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await openSeasons(page, "en");
    const active = page.getByRole("listitem").filter({ hasText: "Arena — Active (seed)" });
    await expect(active.getByText("Live", { exact: true })).toBeVisible();
    // the phone and desktop layouts each carry this line; exactly one is visible
    await expect(active.getByText(/days left|Ends today/).filter({ visible: true })).toHaveCount(1);
    await expect(active.getByRole("button", { name: "Edit Arena — Active (seed)" })).toBeVisible();
    const past = page.getByRole("listitem").filter({ hasText: "Arena — Past (seed)" });
    await expect(past.getByText("Closed", { exact: true })).toBeVisible();
    await expect(past.getByText("Read-only")).toBeVisible();
    await expect(past.getByRole("button")).toHaveCount(0);
  });

  test("navigation: Seasons is live in the sidebar and opens the page", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.locator("aside").getByRole("link", { name: "البطولات" }).click();
    await expect(page).toHaveURL(/\/admin\/seasons$/);
    await expect(page.locator("aside").getByRole("link", { name: "البطولات" })).toHaveAttribute("aria-current", "page");
  });

  test("create dialog suggests next calendar month; validates on the client", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await openSeasons(page, "en");
    await page.getByRole("button", { name: "New season" }).click();
    const dialog = page.getByRole("dialog", { name: "New season" });
    await expect(dialog).toBeVisible();
    // next calendar month after the server's Cairo "today" (BR-S1)
    const start = await dialog.getByLabel("Start date").inputValue();
    const end = await dialog.getByLabel("End date").inputValue();
    expect(start).toMatch(/^\d{4}-\d{2}-01$/);
    expect(end.slice(0, 7)).toBe(start.slice(0, 7));
    await expect(dialog.getByLabel("Season name")).toHaveValue(/^Arena — /);
    await expect(dialog.getByRole("radio", { name: "Championship" })).toHaveAttribute("aria-checked", "true");

    await dialog.getByLabel("Season name").fill("   ");
    await dialog.getByRole("button", { name: "Create season" }).click();
    await expect(dialog.getByText("Enter a season name.")).toBeVisible();

    await dialog.getByLabel("Season name").fill("Test");
    await dialog.getByLabel("End date").fill(`${start.slice(0, 7)}-01`);
    await dialog.getByLabel("Start date").fill(`${start.slice(0, 7)}-15`);
    await dialog.getByRole("button", { name: "Create season" }).click();
    await expect(dialog.getByText("The end date must be on or after the start date.")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("AC-22: overlapping dates are rejected by the server with a clear message (nothing is created)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await openSeasons(page, "ar");
    const before = await page.getByRole("listitem").count();
    await page.getByRole("button", { name: "بطولة جديدة" }).click();
    const dialog = page.getByRole("dialog");
    // overlaps the active seed season
    const res = await page.request.get("/api/seasons");
    const active = (await res.json()).seasons.find((s: { status: string }) => s.status === "active");
    await dialog.getByLabel("تاريخ البداية").fill(active.starts_on);
    await dialog.getByLabel("تاريخ النهاية").fill(active.ends_on);
    await dialog.getByRole("button", { name: "إنشاء البطولة" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("هذه التواريخ تتداخل مع بطولة أخرى. اختر فترة لا تتقاطع مع أي بطولة.");
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByRole("listitem")).toHaveCount(before);
  });

  test("edit an active season: start locked, end can only be extended (client + server)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.ipad);
    await openSeasons(page, "en");
    await page.getByRole("button", { name: "Edit Arena — Active (seed)" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit season" });
    await expect(dialog.getByLabel("Start date")).toBeDisabled();
    await expect(dialog.getByText("The start date can't change once the season has started.")).toBeVisible();
    const end = dialog.getByLabel("End date");
    const current = await end.inputValue();
    const earlier = new Date(`${current}T00:00:00Z`);
    earlier.setUTCDate(earlier.getUTCDate() - 1);
    await end.fill(earlier.toISOString().slice(0, 10));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Once a season has started, its end date can only be extended.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("API rules (no rows written): roles, closed seasons, locked start, extend-only", async ({ page }) => {
    const { seasons } = await (await page.request.get("/api/seasons")).json();
    const active = seasons.find((s: { status: string }) => s.status === "active");
    const closed = seasons.find((s: { status: string }) => s.status === "closed");
    const patch = (id: string, data: object) => page.request.patch(`/api/seasons/${id}`, { data });
    let r = await patch(closed.id, { name: "x" });
    expect(r.status()).toBe(409);
    expect((await r.json()).error).toMatchObject({ code: "SEASON_CLOSED", reason: "closed" });
    r = await patch(active.id, { starts_on: "2026-01-01" });
    expect(r.status()).toBe(403);
    expect((await r.json()).error.reason).toBe("started");
    r = await patch(active.id, { ends_on: active.starts_on });
    expect((await r.json()).error.reason).toBe("extend_only");
    r = await patch(active.id, { closed_at: new Date().toISOString() });
    expect(r.status()).toBe(422); // closing is not an edit (BR-S7)
    r = await page.request.post("/api/seasons", { data: { name: "x", type: "championship", starts_on: "2030-01-01", ends_on: "2029-01-01" } });
    expect((await r.json()).error.reason).toBe("end_before_start");
    expect((await page.request.patch("/api/seasons/not-a-uuid", { data: { name: "x" } })).status()).toBe(404);

    // coach: can read, cannot write
    await page.context().clearCookies();
    await signIn(page, "coach1@gym-arena.local");
    await expect(page).toHaveURL(/\/today$/);
    expect((await page.request.get("/api/seasons")).status()).toBe(200);
    expect((await patch(active.id, { name: "coach" })).status()).toBe(403);
    expect((await page.request.post("/api/seasons", { data: { name: "c", type: "championship", starts_on: "2031-01-01", ends_on: "2031-01-31" } })).status()).toBe(403);
    await page.goto("/admin/seasons");
    await expect(page).toHaveURL(/\/today$/);
  });

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    for (const locale of ["ar", "en"] as const) {
      test(`layout fits ${name} (${locale}) with the dialog open`, async ({ page }) => {
        await page.setViewportSize(vp);
        await openSeasons(page, locale);
        await page.getByRole("button", { name: locale === "ar" ? "بطولة جديدة" : "New season" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        const box = (await page.getByRole("dialog").boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
        for (const button of await page.getByRole("dialog").getByRole("button").all()) {
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
      });
    }
  }

  test.describe("creating and changing seasons @writes", () => {
    test.beforeEach(() => {
      requireWriteTarget(); // per-test check on top of the central global setup
    });
    const COPY = {
      en: { new: "New season", name: "Season name", start: "Start date", end: "End date", create: "Create season", save: "Save",
            created: "Season created", saved: "Changes saved", scheduled: "Scheduled", edit: "Edit" },
      ar: { new: "بطولة جديدة", name: "اسم البطولة", start: "تاريخ البداية", end: "تاريخ النهاية", create: "إنشاء البطولة", save: "حفظ",
            created: "تم إنشاء البطولة", saved: "تم حفظ التغييرات", scheduled: "مجدولة", edit: "تعديل" },
    } as const;

    for (const locale of ["en", "ar"] as const) {
      test(`create → toast + listed; rename; extend — persisted (${locale})`, async ({ page }) => {
        const c = COPY[locale];
        await page.setViewportSize(locale === "ar" ? VIEWPORTS.ipad : VIEWPORTS.desktop);
        await openSeasons(page, locale);
        // a free month far in the future so reruns on the same stack never collide
        const year = 2100 + Math.floor(Math.random() * 800);
        const name = `E2E ${locale} ${year}`;

        await page.getByRole("button", { name: c.new }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel(c.name).fill(name);
        await dialog.getByLabel(c.end).fill(`${year}-03-31`);
        await dialog.getByLabel(c.start).fill(`${year}-03-01`);
        await dialog.getByRole("button", { name: c.create }).click();
        await expect(page.getByRole("status").filter({ hasText: c.created })).toBeVisible();
        const row = page.getByRole("listitem").filter({ hasText: name });
        await expect(row.getByText(c.scheduled, { exact: true })).toBeVisible();

        await row.getByRole("button", { name: `${c.edit} ${name}` }).click();
        await dialog.getByLabel(c.name).fill(`${name} renamed`);
        await dialog.getByLabel(c.end).fill(`${year}-04-05`);
        await dialog.getByRole("button", { name: c.save }).click();
        await expect(page.getByRole("status").filter({ hasText: c.saved })).toBeVisible();
        await expect(page.getByRole("listitem").filter({ hasText: `${name} renamed` })).toBeVisible();

        // persisted on the server exactly as entered (one name field, D18)
        const { seasons } = await (await page.request.get("/api/seasons")).json();
        const saved = seasons.find((s: { name: string }) => s.name === `${name} renamed`);
        expect(saved).toMatchObject({ type: "championship", starts_on: `${year}-03-01`, ends_on: `${year}-04-05`, status: "scheduled" });
        expect(saved.participants).toBeGreaterThan(0); // all active members joined (trigger)
      });
    }
  });
});
