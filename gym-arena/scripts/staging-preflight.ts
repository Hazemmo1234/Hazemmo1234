/**
 * npm run staging:preflight — reads .env.staging (git-ignored) and proves the staging settings
 * point at the staging Supabase project and never at production. Prints check names and project
 * refs only, never a value. Exit code 1 on any FAIL. Makes no network connection.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkStaging, hasFailure } from "./staging-check";

const refFile = join(__dirname, "..", "supabase", ".temp", "project-ref");
const linkedRef = existsSync(refFile) ? readFileSync(refFile, "utf8") : undefined;

const results = checkStaging({ env: process.env, linkedRef });
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.check}: ${r.detail}`);
if (hasFailure(results)) {
  console.error("\nStaging preflight FAILED — fix the items above before any staging step.");
  process.exit(1);
}
console.log("\nStaging preflight passed.");
