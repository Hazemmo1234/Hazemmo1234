import { expect, test } from "@playwright/test";
import { LOCAL_ONLY, expectLanguage, signIn } from "./helpers";

test("login page defaults to Arabic RTL with the logo (BR-L1)", async ({ page }) => {
  await page.goto("/login");
  await expectLanguage(page, "ar");
  await expect(page.getByAltText("DFN GYM")).toBeVisible();
  await expect(page.getByRole("button", { name: "دخول", exact: true })).toBeVisible();
});

test("unauthenticated users are sent to /login; API answers 401", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(401);
  expect((await me.json()).error.code).toBe("UNAUTHENTICATED");
});

test("security headers are sent (SECURITY_SPECIFICATION)", async ({ page }) => {
  const headers = (await page.request.get("/login")).headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
  expect((await page.request.get("/tv")).headers()["referrer-policy"]).toBe("no-referrer");
});

test.describe("sign-in flows (AC-1, AC-2)", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");

  test("coach signs in → /today; /admin redirects back to /today", async ({ page }) => {
    await signIn(page, "coach1@gym-arena.local");
    await expect(page).toHaveURL(/\/today$/);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/today$/);
    expect((await (await page.request.get("/api/me")).json()).role).toBe("coach");
    expect((await page.request.get("/api/settings")).status()).toBe(403);
  });

  test("admin signs in → /admin/dashboard", async ({ page }) => {
    await signIn(page, "admin@gym-arena.local");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test("wrong password shows the error in the current language", async ({ page }) => {
    await signIn(page, "coach1@gym-arena.local", "nope-nope");
    await expect(page.locator("form [role=alert]")).toHaveText("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    await page.getByRole("button", { name: "English" }).click();
    await expectLanguage(page, "en");
    await page.locator('input[name="password"]').fill("nope-nope");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("form [role=alert]")).toHaveText("Incorrect email or password");
  });
});
