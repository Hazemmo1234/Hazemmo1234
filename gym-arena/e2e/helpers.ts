import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { resolveWriteTarget } from "../tests/support/write-target";

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

/**
 * Fail-closed gate for every test that writes (@writes): throws unless the configured stack is
 * positively a test stack — the long-lived local test stack, the fresh disposable stack, or
 * the CI job's own disposable stack (tests/support/write-target.ts). Replaces a hard-coded
 * port check that could only ever pass on one machine.
 */
export function requireWriteTarget() {
  return resolveWriteTarget(process.env);
}

/**
 * Runs owner-level SQL for fixtures the API deliberately cannot create (pre-season baselines,
 * aged files), on the VERIFIED test database only — the connection comes from the same
 * environment the gate just checked, never from a container name.
 */
export async function ownerSql(sql: string): Promise<void> {
  requireWriteTarget();
  const db = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await db.unsafe(sql);
  } finally {
    await db.end();
  }
}
