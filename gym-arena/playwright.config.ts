import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // Central write guard: verifies the ACTUAL stack before any test of any project (e2e/global-setup.ts).
  globalSetup: "./e2e/global-setup.ts",
  // One shared local database with shared seed accounts whose language preference is
  // stored on the profile: run serially so tests never change each other's state.
  fullyParallel: false,
  workers: 1,
  // Tests tagged @writes create permanent rows (seasons, audit entries, …). They run only with
  // the opt-in E2E_ALLOW_WRITES=1, and — like every local run — only after the global setup has
  // verified the stack as a test stack (never the developer's own database).
  grepInvert: process.env.E2E_ALLOW_WRITES === "1" ? undefined : /@writes/,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL, trace: "off", ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}) },
  projects: [
    { name: "coach-mobile", use: { ...devices["Pixel 7"] } },
    { name: "tv", use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `npm run start -- -p ${port}`, url: baseURL, reuseExistingServer: false, timeout: 120_000 },
});
