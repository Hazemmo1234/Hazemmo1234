import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Real-server checks (CI only): start the built app / next dev and judge what it actually sends.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // central guard: CI only, verified gym-arena-ci stack, attested build — before anything loads
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 240_000,
    hookTimeout: 240_000,
  },
});
