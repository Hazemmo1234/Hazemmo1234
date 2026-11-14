import { expect, test } from "@playwright/test";

test("login page renders in Arabic RTL with the logo", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByAltText("DFN GYM")).toBeVisible();
  await expect(page.getByRole("button", { name: "دخول" })).toBeVisible();
});

test("unauthenticated users are sent to /login", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});

test("TV with an invalid key is not authorized (AC-26)", async ({ page }) => {
  await page.goto("/tv?key=wrong");
  await expect(page.getByText("Display not authorized")).toBeVisible();
});

// Requires the local seed (supabase/seed.sql). Skipped against remote targets.
test.describe("sign-in flows (AC-1, AC-2)", () => {
  test.skip(!!process.env.E2E_BASE_URL, "seed accounts exist only locally");

  test("coach signs in → /today; /admin redirects back to /today", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("coach1@gym-arena.local");
    await page.locator('input[name="password"]').fill("Password123!");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/today$/);
  });

  test("admin signs in → /admin/dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("admin@gym-arena.local");
    await page.locator('input[name="password"]').fill("Password123!");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test("wrong password shows an Arabic error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("coach1@gym-arena.local");
    await page.locator('input[name="password"]').fill("nope-nope");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.locator("form [role=alert]")).toHaveText("البريد الإلكتروني أو كلمة المرور غير صحيحة");
  });
});
