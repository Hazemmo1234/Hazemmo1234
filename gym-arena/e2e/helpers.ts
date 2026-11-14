import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Password123!";
export const TV_KEY = "dev-tv-key-0123456789abcdef0123456789abcdef";
/** Seed accounts exist only on the local stack (supabase/seed.sql). */
export const LOCAL_ONLY = !!process.env.E2E_BASE_URL;

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

/** AC-34: correct lang/dir and no horizontal overflow. */
export async function expectLanguage(page: Page, locale: "ar" | "en") {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
}
