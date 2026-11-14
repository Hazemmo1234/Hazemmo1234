import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // One shared local database with shared seed accounts whose language preference is
  // stored on the profile: run serially so tests never change each other's state.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL, trace: "off", ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}) },
  projects: [
    { name: "coach-mobile", use: { ...devices["Pixel 7"] } },
    { name: "tv", use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
