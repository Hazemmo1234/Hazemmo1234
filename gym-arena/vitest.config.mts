import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/modules/scoring/**", "src/lib/time.ts", "src/lib/routes.ts", "src/lib/errors.ts", "src/lib/i18n/**", "src/i18n/config.ts"],
      // CLAUDE.md: modules/scoring has 100% branch coverage (enforced from M1)
      thresholds: { "src/modules/scoring/**": { branches: 100, functions: 100, lines: 100, statements: 100 } },
    },
  },
});
