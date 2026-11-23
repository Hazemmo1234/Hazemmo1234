/**
 * npm run staging:migrate            — DRY RUN: lists the migrations that would be applied to STAGING.
 * npm run staging:migrate -- --apply — applies them.
 *
 * Runs the staging preflight first and refuses on any FAIL, then calls
 * `supabase db push --remote=<STAGING_MIGRATION_DATABASE_URL> --skip-vault` with an explicit URL, so the
 * CLI link of this folder (if any) is never used. Never seeds (supabase/seed.sql also refuses any
 * non-local database). The URL is passed to the CLI and never printed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkStaging, hasFailure } from "./staging-check";

const app = join(__dirname, "..");
const refFile = join(app, "supabase", ".temp", "project-ref");
const linkedRef = existsSync(refFile) ? readFileSync(refFile, "utf8") : undefined;

const url = process.env.STAGING_MIGRATION_DATABASE_URL?.trim();
if (!url) {
  console.error("STAGING_MIGRATION_DATABASE_URL is missing from .env.staging (owner connection of the STAGING project).");
  process.exit(1);
}
const results = checkStaging({ env: process.env, linkedRef });
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.check}: ${r.detail}`);
if (hasFailure(results)) {
  console.error("\nRefusing to migrate: staging preflight failed.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
console.log(apply ? "\nApplying migrations to STAGING…" : "\nDry run (add `-- --apply` to apply):");
const args = ["supabase", "db", "push", `--remote=${url}`, "--skip-vault", "--workdir", app];
if (!apply) args.push("--dry-run");
const r = spawnSync("npx", args, { cwd: app, stdio: "inherit" });
process.exit(r.status ?? 1);
