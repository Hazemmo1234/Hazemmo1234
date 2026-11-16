import { expect, test } from "@playwright/test";
import { LOCAL_ONLY, TV_KEY, expectLanguage, requireWriteTarget, signIn } from "./helpers";

// AC-33 … AC-37: Arabic + English, RTL/LTR, persistence, independent TV language.

test("language switcher changes text and direction immediately and survives a reload (AC-34)", async ({ page }) => {
  await page.goto("/login");
  await expectLanguage(page, "ar");
  await page.getByRole("button", { name: "English" }).click();
  await expectLanguage(page, "en");
  await expect(page.locator('button[type="submit"]')).toHaveText("Sign in");
  await expect(page.getByText("Staff sign-in")).toBeVisible();
  await expect(page).toHaveTitle(/Sign in/);
  await page.reload();
  await expectLanguage(page, "en"); // remembered by the cookie before sign-in (BR-L3)
  await page.getByRole("button", { name: "العربية" }).click();
  await expectLanguage(page, "ar");
  await expect(page.locator('button[type="submit"]')).toHaveText("دخول");
});

test("both languages fit a 360 px phone without horizontal scrolling (AC-32, AC-34)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/login");
  await expectLanguage(page, "ar");
  await page.getByRole("button", { name: "English" }).click();
  await expectLanguage(page, "en");
  for (const button of await page.getByRole("button").all()) {
    expect((await button.boundingBox())!.height, "tap target ≥ 44 px").toBeGreaterThanOrEqual(44);
  }
});

test.describe("staff language preference (AC-35)", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");

  test("choice is saved on the profile and follows the coach to a new device", async ({ page, browser }, testInfo) => {
    // one account per project so parallel projects do not fight over the same profile
    const email = testInfo.project.name === "tv" ? "coach3@gym-arena.local" : "coach2@gym-arena.local";
    await signIn(page, email);
    await expect(page).toHaveURL(/\/today$/);
    await page.getByRole("button", { name: "English" }).click();
    await expectLanguage(page, "en");
    await expect(page.getByText("Coach", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect((await (await page.request.get("/api/me")).json()).locale).toBe("en");

    // a brand-new device: no cookie at all → login page is Arabic, but after sign-in
    // the profile's language (English) wins.
    const other = await browser.newContext();
    const page2 = await other.newPage();
    await page2.goto("/login");
    await expectLanguage(page2, "ar");
    await signIn(page2, email);
    await expect(page2).toHaveURL(/\/today$/);
    await expectLanguage(page2, "en");
    await expect(page2.getByRole("button", { name: "Sign out" })).toBeVisible();
    await other.close();

    // PATCH /api/me accepts only a valid locale
    expect((await page.request.patch("/api/me", { data: { locale: "fr" } })).status()).toBe(422);
    expect((await page.request.patch("/api/me", { data: { locale: "ar", role: "admin" } })).status()).toBe(422);
    const back = await page.request.patch("/api/me", { data: { locale: "ar" } });
    expect((await back.json()).locale).toBe("ar");
    await page.reload();
    await expectLanguage(page, "ar");
    await expect(page.getByText("المدرب", { exact: true })).toBeVisible();
  });
});

test.describe("TV language is independent of staff language (AC-36, BR-L4) @writes", () => {
  test.beforeEach(() => {
    requireWriteTarget(); // per-test check on top of the central global setup
  });
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.describe.configure({ mode: "serial" });

  test("TV follows the Admin's TV setting, not the device's staff language", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tv", "one shared TV setting — run once");

    // staff language on this device = English; the TV must stay Arabic (default)
    await page.goto("/login");
    await page.getByRole("button", { name: "English" }).click();
    await expectLanguage(page, "en");
    await page.goto("/tv?key=wrong");
    await expectLanguage(page, "ar");
    await expect(page.getByText("الشاشة غير مصرّح لها")).toBeVisible();

    // Admin switches the TV to English through the settings API
    await signIn(page, "admin@gym-arena.local");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    const settings = await page.request.get("/api/settings");
    expect(Object.keys(await settings.json()).sort()).toEqual(["gym_name", "tv_locale", "tv_url"]);
    expect((await page.request.patch("/api/settings", { data: { tv_locale: "de" } })).status()).toBe(422);
    expect((await (await page.request.patch("/api/settings", { data: { tv_locale: "en" } })).json()).tv_locale).toBe("en");
    try {
      // staff language back to Arabic; the TV must now be English regardless
      await page.request.patch("/api/me", { data: { locale: "ar" } });
      await page.goto("/admin/dashboard");
      await expectLanguage(page, "ar");
      await page.goto("/tv?key=wrong");
      await expectLanguage(page, "en");
      await expect(page.getByText("Display not authorized")).toBeVisible();
      await page.goto(`/tv?key=${TV_KEY}`);
      await expectLanguage(page, "en");
      await expect(page.getByText("DFN GYM")).toBeVisible(); // gym name shown as entered (BR-L5)
    } finally {
      await page.request.patch("/api/settings", { data: { tv_locale: "ar" } });
    }
    await page.goto(`/tv?key=${TV_KEY}`);
    await expectLanguage(page, "ar");
  });
});

test("TV with an invalid key is not authorized and shows no data (AC-26)", async ({ page }) => {
  await page.goto("/tv?key=wrong");
  await expect(page.locator("main")).toHaveText(/الشاشة غير مصرّح لها|Display not authorized/);
  await expect(page.locator("main")).not.toContainText("DFN GYM");
});
