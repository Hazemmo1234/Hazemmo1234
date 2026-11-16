import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database / RLS tests against the local Supabase stack (`npx supabase start` + `db reset`).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    // central write guard (tests/support): verify the ACTUAL stack once before anything loads,
    // then re-check the environment in every worker before every test file
    globalSetup: ["tests/db/global-setup.ts"],
    setupFiles: ["tests/db/setup-guard.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
