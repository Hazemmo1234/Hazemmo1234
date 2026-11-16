/**
 * Central write guard, part 2 (vitest.db.config.mts `setupFiles`): runs in EVERY test worker
 * before EVERY DB test file, whether or not the file imports ./helpers. It repeats the
 * synchronous checks against this worker's own environment; the global setup has already
 * verified the actual stack behind it.
 */
import { resolveWriteTarget } from "../support/write-target";

if (process.env.TEST_DB_ISOLATED !== "1") {
  throw new Error("Database tests refuse to run without TEST_DB_ISOLATED=1. They create permanent rows.");
}
resolveWriteTarget(process.env);
