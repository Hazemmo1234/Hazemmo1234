/**
 * npm run staging:migrate            — DRY RUN: lists the migrations that would be applied to STAGING.
 * npm run staging:migrate -- --apply — applies them.
 *
 * Runs the staging preflight first and refuses on any FAIL, then calls
 * `supabase db push --remote=<STAGING_MIGRATION_DATABASE_URL> --skip-vault` with an explicit URL, so the
 * CLI link of this folder (if any) is never used. Never seeds (supabase/seed.sql also refuses any
 * non-local database). The URL is passed to the CLI and never printed; inherited PG* variables are
 * removed so none of them can redirect the connection.
 */
import { spawnSync } from "node:child_process";
import { APP_DIR, envWithoutPg, runPreflightOrExit } from "./staging-env";

const url = process.env.STAGING_MIGRATION_DATABASE_URL?.trim();
if (!url) {
  console.error("STAGING_MIGRATION_DATABASE_URL is missing from .env.staging (owner connection of the STAGING project).");
  process.exit(1);
}
runPreflightOrExit("Refusing to migrate: staging preflight failed.");

const apply = process.argv.includes("--apply");
console.log(apply ? "\nApplying migrations to STAGING…" : "\nDry run (add `-- --apply` to apply):");
const args = ["supabase", "db", "push", `--remote=${url}`, "--skip-vault", "--workdir", APP_DIR];
if (!apply) args.push("--dry-run");
const r = spawnSync("npx", args, { cwd: APP_DIR, stdio: "inherit", env: envWithoutPg() });
process.exit(r.status ?? 1);
