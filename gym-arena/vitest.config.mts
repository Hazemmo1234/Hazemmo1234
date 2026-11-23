import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/modules/scoring/**", "src/lib/time.ts", "src/lib/routes.ts", "src/lib/errors.ts", "src/lib/i18n/**", "src/i18n/config.ts", "src/modules/seasons/status.ts", "src/lib/initials.ts", "src/modules/seasons/rules.ts", "src/lib/validation/**", "src/lib/phone.ts", "src/modules/members/rookie.ts", "src/modules/members/avatar-cleanup.ts", "src/modules/entries/card.ts", "src/modules/entries/evidence.ts", "src/lib/validation/entries.ts", "src/lib/supabase/fetch-all.ts", "src/lib/number-input.ts", "src/modules/leaderboard/board.ts", "tests/support/write-target.ts", "tests/support/stack-identity.ts", "src/modules/tv/payload.ts", "src/modules/tv/reveal.ts", "src/modules/tv/paging.ts", "src/modules/seasons/results.ts", "src/modules/audit/present.ts", "scripts/staging-check.ts", "scripts/staging-verify-core.ts"],
      // CLAUDE.md: modules/scoring has 100% branch coverage (enforced from M1)
      thresholds: { "src/modules/scoring/**": { branches: 100, functions: 100, lines: 100, statements: 100 } },
    },
  },
});
