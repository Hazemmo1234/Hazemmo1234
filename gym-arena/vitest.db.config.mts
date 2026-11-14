import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database / RLS tests against the local Supabase stack (`npx supabase start` + `db reset`).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
