import { expect, test, type Page } from "@playwright/test";
import { LOCAL_ONLY, expectLanguage, signIn } from "./helpers";

// M2 step 1 — admin layout & navigation across phone, iPad and desktop, AR + EN.
test.describe("admin shell", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");

  const VIEWPORTS = {
    phone: { width: 360, height: 780 },
    ipadPortrait: { width: 820, height: 1180 },
    ipadLandscape: { width: 1180, height: 820 },
    desktop: { width: 1440, height: 900 },
  };

  async function setLanguage(page: Page, locale: "ar" | "en") {
    const status = (await page.request.patch("/api/me", { data: { locale } })).status();
    expect(status).toBe(200);
    await page.reload();
    await expectLanguage(page, locale);
  }

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "viewports are set per test; run once");
    await signIn(page, "admin@gym-arena.local");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test.afterEach(async ({ page }) => {
    await page.request.patch("/api/me", { data: { locale: "ar" } });
  });

  test("dashboard shows live data from the database", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("الرئيسية");
    await expect(page.getByRole("heading", { name: "Arena — Active (seed)" })).toBeVisible();
    await expect(page.getByText("الأعضاء النشطون")).toBeVisible();
  });

  for (const locale of ["ar", "en"] as const) {
    test(`phone (${locale}): top bar + bottom tabs, no side navigation, no overflow`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.phone);
      await setLanguage(page, locale);
      // the side navigation is display:none on phones, so only the bottom bar is exposed
      await expect(page.getByRole("navigation")).toHaveCount(1);
      await expect(page.locator("aside")).toBeHidden();
      const bottom = page.locator("nav.fixed");
      await expect(bottom).toBeVisible();
      const box = (await bottom.boundingBox())!;
      expect(box.y + box.height).toBeGreaterThanOrEqual(780 - 1);
      for (const link of await bottom.getByRole("link").all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    });

    test(`iPad portrait (${locale}): icon rail on the start side`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.ipadPortrait);
      await setLanguage(page, locale);
      const aside = page.locator("aside");
      await expect(aside).toBeVisible();
      await expect(page.locator("nav.fixed")).toBeHidden();
      const box = (await aside.boundingBox())!;
      expect(box.width).toBeLessThan(120);
      // start side: right in Arabic, left in English
      if (locale === "ar") expect(box.x).toBeGreaterThan(VIEWPORTS.ipadPortrait.width / 2);
      else expect(box.x).toBe(0);
    });

    test(`iPad landscape + desktop (${locale}): full sidebar with labels`, async ({ page }) => {
      for (const vp of [VIEWPORTS.ipadLandscape, VIEWPORTS.desktop]) {
        await page.setViewportSize(vp);
        await setLanguage(page, locale);
        const aside = page.locator("aside");
        const box = (await aside.boundingBox())!;
        expect(box.width).toBeGreaterThan(200);
        if (locale === "ar") expect(box.x + box.width).toBeCloseTo(vp.width, 0);
        else expect(box.x).toBe(0);
        await expect(aside.getByRole("link", { name: locale === "ar" ? "الرئيسية" : "Dashboard" })).toHaveAttribute("aria-current", "page");
      }
    });
  }

  test("unfinished sections are not links (no dead pages)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    const aside = page.locator("aside");
    const links = await aside.getByRole("link").allTextContents();
    expect(links.some((l) => l.includes("الرئيسية"))).toBe(true);
    await expect(aside.locator('[aria-disabled="true"]').first()).toBeVisible();
  });

  test("language switch from the sidebar flips direction without a manual reload", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.waitForLoadState("networkidle"); // click only once the switcher is hydrated
    await page.locator("aside").getByRole("button", { name: "English" }).click();
    await expectLanguage(page, "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard");
    const box = (await page.locator("aside").boundingBox())!;
    expect(box.x).toBe(0);
  });

  test("sign out from the phone top bar returns to login", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await page.locator("header").getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
