import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LOCAL_ONLY, TV_KEY, ownerSql, requireWriteTarget, signIn } from "./helpers";

// M5/M6 admin + coach screens (UX A2, A5, A6, A7, C7): real UI, real API, real database.
// @writes: creates a member and an entry, corrects and voids it, starts a reveal, rotates the
// TV key (and restores the seed key on the disposable stack).
const PAST_SEASON = "00000000-0000-4000-b000-000000000001";
const ACTIVE_SEASON = "00000000-0000-4000-b000-000000000002";
const COACH1 = "00000000-0000-4000-a000-000000000011";

/** Sign in as the admin and wait until the session is established (the redirect to the dashboard). */
async function asAdmin(page: Page) {
  await signIn(page, "admin@gym-arena.local");
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}

async function english(page: Page) {
  expect((await page.request.patch("/api/me", { data: { locale: "en" } })).status()).toBe(200);
}

test.describe("M5/M6 admin and coach screens @writes", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "API and admin flows run once");
    requireWriteTarget();
  });
  test.afterEach(async ({ page }) => {
    await page.request.patch("/api/me", { data: { locale: "ar" } }).catch(() => {});
  });

  test("role boundaries on the new APIs (401 signed out, 403 for coaches)", async ({ page }) => {
    for (const url of ["/api/entries", "/api/audit", "/api/settings", `/api/seasons/${PAST_SEASON}/close`]) {
      expect((await page.request.get(url)).status(), url).toBe(401);
    }
    await signIn(page, "coach1@gym-arena.local");
    await expect(page).toHaveURL(/\/today$/);
    for (const url of ["/api/entries", "/api/audit", "/api/settings", `/api/seasons/${PAST_SEASON}/close`]) {
      expect((await page.request.get(url)).status(), url).toBe(403);
    }
    expect((await page.request.post("/api/settings/tv-key")).status()).toBe(403);
    expect((await page.request.post(`/api/seasons/${PAST_SEASON}/reveal`)).status()).toBe(403);
    expect((await page.request.post(`/api/seasons/${ACTIVE_SEASON}/close`)).status()).toBe(403);
    // the coach may read final results (own clients highlighted) and the history screen
    expect((await page.request.get(`/api/seasons/${PAST_SEASON}/results`)).status()).toBe(200);
    await english(page);
    await page.goto("/history");
    await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: /Arena — Past \(seed\)/ }).click();
    await expect(page.getByRole("heading", { name: "Arena — Past (seed)", level: 1 })).toBeVisible();
  });

  test("entries: correct and void with a mandatory reason; both audited (BR-E9, BR-E11, AC-47)", async ({ page }) => {
    await asAdmin(page);
    await english(page);
    const name = `E2E Entries ${Date.now() % 1_000_000}`;
    const voidReason = `E2E: wrong client (${name})`; // unique per run: retries create new rows
    const phone = `+2012${String(Date.now() % 100_000_000).padStart(8, "0")}`;
    const created = await page.request.post("/api/members", { data: { full_name: name, phone, photo_consent: false, coach_id: COACH1 } });
    expect(created.status()).toBe(201);
    const memberId = (await created.json()).member.id as string;
    // a rookie's pull-ups never change the total, so no photo is required (SCORING §6)
    const logged = await page.request.post("/api/entries", { data: { member_id: memberId, category: "pullups", reps: 10 } });
    expect(logged.status()).toBe(201);
    const entryId = (await logged.json()).entry.id as string;

    // API: reason required, category rules re-checked, coaches forbidden
    expect((await page.request.patch(`/api/entries/${entryId}`, { data: { reps: 12 } })).status()).toBe(422);
    expect((await page.request.patch(`/api/entries/${entryId}`, { data: { reps: 999, reason: "x" } })).status()).toBe(422);
    expect((await page.request.patch(`/api/entries/${entryId}`, { data: { weight_kg: "50", reason: "x" } })).status()).toBe(422);

    // UI: filter by member, correct with a reason
    await page.goto(`/admin/entries?q=${encodeURIComponent(name)}`);
    await expect(page.getByText(name)).toBeVisible();
    await page.getByRole("button", { name: `Correct ${name}'s entry` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reps").fill("12");
    await expect(dialog.getByRole("button", { name: "Save correction" })).toBeDisabled(); // no reason yet
    await dialog.getByLabel("Reason (required)").fill("E2E: counted 12, typed 10");
    await dialog.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByRole("status")).toContainText("Entry corrected");
    await expect(page.getByText("12 reps")).toBeVisible();

    // UI: void with a reason → undone, still listed when "Show undone entries" is on
    await page.getByRole("button", { name: `Void ${name}'s entry` }).click();
    await page.getByRole("dialog").getByLabel("Reason (required)").fill(voidReason);
    await page.getByRole("dialog").getByRole("button", { name: "Void entry" }).click();
    await expect(page.getByRole("status")).toContainText("Entry voided");
    await page.getByLabel("Show undone entries").check();
    await expect(page.getByText(voidReason)).toBeVisible();
    const row = await (await page.request.get(`/api/entries/${entryId}`)).json();
    expect(row).toMatchObject({ reps: 12, void_reason: voidReason });
    expect(row.voided_at).toBeTruthy();
    expect((await page.request.patch(`/api/entries/${entryId}`, { data: { reps: 11, reason: "after void" } })).status()).toBe(403);

    // audit: both corrections with actor, target and reason, newest first; filter by action
    const audit = await (await page.request.get("/api/audit?action=entry.edit")).json();
    expect(audit.rows[0]).toMatchObject({ action: "entry.edit", target: name, reason: "E2E: counted 12, typed 10" });
    expect(audit.rows[0].changes).toEqual(expect.arrayContaining([{ field: "reps", before: "10", after: "12" }]));
    expect(JSON.stringify(audit)).not.toMatch(/photo_path|\+20\d{9}/);
    await page.goto("/admin/audit?action=entry.void");
    const record = page.getByRole("listitem").filter({ hasText: voidReason });
    await expect(record).toHaveCount(1);
    await expect(record.getByText("Entry voided")).toBeVisible();
    await expect(record.getByText(name, { exact: true })).toBeVisible();
  });

  test("seasons: close and reveal refuse the wrong moment; reveal of a closed championship; results page", async ({ page }) => {
    await asAdmin(page);
    await english(page);
    const preview = await (await page.request.get(`/api/seasons/${ACTIVE_SEASON}/close`)).json();
    expect(preview).toMatchObject({ can_close: false, blocked: "not_ended" });
    const early = await page.request.post(`/api/seasons/${ACTIVE_SEASON}/close`);
    expect(early.status()).toBe(409);
    expect((await early.json()).error).toMatchObject({ code: "CONFLICT", reason: "not_ended" });
    const again = await page.request.post(`/api/seasons/${PAST_SEASON}/close`);
    expect(again.status()).toBe(409);
    expect((await again.json()).error.code).toBe("SEASON_CLOSED");
    const openReveal = await page.request.post(`/api/seasons/${ACTIVE_SEASON}/reveal`);
    expect(openReveal.status()).toBe(409);
    expect((await openReveal.json()).error.reason).toBe("not_closed");

    await page.goto("/admin/seasons");
    await page.getByRole("button", { name: "Start the winner reveal of Arena — Past (seed)" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Start reveal|Reveal again/ }).click();
    await expect(page.getByRole("status")).toContainText("Reveal started");
    const audit = await (await page.request.get("/api/audit?action=season.reveal")).json();
    expect(audit.rows[0]).toMatchObject({ action: "season.reveal", target: "Arena — Past (seed)" });

    await page.getByRole("link", { name: "Final results of Arena — Past (seed)" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/seasons/${PAST_SEASON}$`));
    await expect(page.getByText("Final — frozen at close", { exact: false })).toBeVisible();
  });

  test("settings: TV link masked; key rotation invalidates the old key at once (seed key restored)", async ({ page }) => {
    test.setTimeout(60_000); // rotation + three full TV-state computations
    // desktop width: on the phone layout the fixed tab bar can sit over the last card's buttons
    // and the click waits for them; the phone layout itself is covered by the responsive test
    await page.setViewportSize({ width: 1280, height: 900 });
    await asAdmin(page);
    await english(page);
    const url = page.getByTestId("tv-url");
    await test.step("the TV link is masked until the admin asks to see it", async () => {
      await page.goto("/admin/settings");
      await expect(url).toContainText("•");
      await expect(url).not.toContainText(TV_KEY);
      await page.getByRole("button", { name: "Show the TV key" }).click();
      await expect(url).toContainText(TV_KEY);
      await expect(page.getByRole("button", { name: "Save" })).toBeDisabled(); // nothing changed
    });
    try {
      let newKey = "";
      await test.step("rotate from the Settings screen", async () => {
        await page.getByRole("button", { name: "Generate new key" }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Generate new key" }).click();
        await expect(page.getByRole("status")).toContainText("New TV key generated");
        const settings = await (await page.request.get("/api/settings")).json();
        newKey = new URL(settings.tv_url).searchParams.get("key")!;
        expect(newKey).not.toBe(TV_KEY);
        expect(newKey.length).toBeGreaterThanOrEqual(32);
      });
      await test.step("the old key is refused at once; the new key works", async () => {
        expect((await page.request.get(`/api/tv/state?key=${TV_KEY}`)).status()).toBe(401);
        expect((await page.request.get(`/api/tv/state?key=${encodeURIComponent(newKey)}`)).status()).toBe(200);
      });
      await test.step("the rotation is audited without the key", async () => {
        const audit = await (await page.request.get("/api/audit?action=tv_key.regenerate")).json();
        expect(audit.rows[0]).toMatchObject({ action: "tv_key.regenerate" });
        expect(JSON.stringify(audit)).not.toContain(newKey);
      });
    } finally {
      await test.step("restore the seed TV key on the disposable stack", async () => {
        await ownerSql(`update public.app_settings set tv_key = '${TV_KEY}' where id = 1`);
      });
    }
    expect((await page.request.get(`/api/tv/state?key=${TV_KEY}`)).status()).toBe(200);
  });

  test("phone (360 px): the last Settings buttons are never under the bottom tab bar and respond to a real tap", async ({ page }) => {
    await asAdmin(page);
    await english(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/admin/settings");
    const bar = page.locator("nav.fixed");
    await expect(bar).toBeVisible();
    // scrolled to the very end, every TV-card control must sit fully above the fixed bar
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barTop = (await bar.boundingBox())!.y;
    for (const name of ["Show the TV key", "Copy link", "Open TV", "Generate new key"]) {
      const control = page.getByRole(name === "Open TV" ? "link" : "button", { name, exact: true });
      await control.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const box = (await control.boundingBox())!;
      expect(box.y + box.height, `${name} ends above the tab bar`).toBeLessThanOrEqual(barTop);
      expect(box.height, `${name} tap target`).toBeGreaterThanOrEqual(44);
    }
    // a real click (no force): the topmost element at the button's centre is the button itself
    await page.getByRole("button", { name: "Show the TV key" }).click({ timeout: 10_000 });
    await expect(page.getByTestId("tv-url")).toContainText(TV_KEY);
  });

  test("new screens fit 360 px and tablet widths in Arabic (RTL) and English (LTR)", async ({ page }) => {
    const noOverflow = async (label: string) => {
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll, `${label}: horizontal overflow`).toBeLessThanOrEqual(inner);
    };
    await asAdmin(page);
    for (const locale of ["ar", "en"] as const) {
      expect((await page.request.patch("/api/me", { data: { locale } })).status()).toBe(200);
      for (const width of [360, 820]) {
        await page.setViewportSize({ width, height: 800 });
        for (const path of ["/admin/settings", "/admin/entries", "/admin/audit", "/admin/seasons", `/admin/seasons/${PAST_SEASON}`]) {
          await page.goto(path);
          await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await noOverflow(`${locale} ${width}px ${path}`);
        }
      }
    }
  });

  test("missing deployment secrets fail safely: close → 503 without any change; cron → 401", async ({ page }) => {
    await asAdmin(page);
    // an ended, still-open season far in the past (unique month per attempt: no overlap)
    let seasonId = "";
    for (let attempt = 0; attempt < 6 && !seasonId; attempt++) {
      const year = 1950 + Math.floor(Math.random() * 50);
      const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
      const res = await page.request.post("/api/seasons", {
        data: { name: `E2E ended ${year}-${month}`, type: "championship", starts_on: `${year}-${month}-01`, ends_on: `${year}-${month}-20` },
      });
      if (res.status() === 201 || res.status() === 200) seasonId = (await res.json()).season.id;
    }
    expect(seasonId).not.toBe("");
    const preview = await (await page.request.get(`/api/seasons/${seasonId}/close`)).json();
    expect(preview).toMatchObject({ can_close: true, blocked: null });
    // the CI stack has no SEASON_CLOSE_DATABASE_URL (a deployment secret, D27)
    const close = await page.request.post(`/api/seasons/${seasonId}/close`);
    expect(close.status()).toBe(503);
    expect((await close.json()).error.reason).toBe("close_not_configured");
    const after = await (await page.request.get(`/api/seasons/${seasonId}/close`)).json();
    expect(after).toMatchObject({ can_close: true, blocked: null }); // still open, nothing frozen
    expect((await page.request.get(`/api/seasons/${seasonId}/results`)).status()).toBe(409);

    for (const auth of [undefined, "Bearer wrong-secret-0123456789"]) {
      const res = await page.request.get("/api/cron/snapshot", auth ? { headers: { authorization: auth } } : {});
      expect(res.status()).toBe(401);
    }
  });
});

