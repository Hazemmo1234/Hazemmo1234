/**
 * npm run staging:preflight — proves the staging settings in .env.staging (git-ignored) point at
 * the staging Supabase project and never at production, and that no shell variable overrides
 * the file. Prints check names and project refs only, never a value. Exit code 1 on any FAIL.
 * Makes no network connection.
 */
import { runPreflightOrExit } from "./staging-env";

runPreflightOrExit("Staging preflight FAILED — fix the items above before any staging step.");
console.log("\nStaging preflight passed.");
