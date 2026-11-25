/**
 * npm run staging:migrate            — DRY RUN: lists the migrations that would be applied to STAGING.
 * npm run staging:migrate -- --apply — applies them.
 * npm run prod:migrate [-- --apply]  — the same for PRODUCTION; --apply also asks you to type the
 *                                      production project ref.
 *
 * Runs the target's preflight first and refuses on any FAIL, then calls
 * `supabase db push --remote=<owner URL> --skip-vault` with an explicit URL, so the CLI link of
 * this folder (if any) is never used. Never seeds (supabase/seed.sql also refuses any non-local
 * database). The URL is passed to the CLI and never printed; inherited PG* variables are removed
 * so none of them can redirect the connection.
 */
import { spawnSync } from "node:child_process";
import { TARGETS } from "./staging-check";
import { APP_DIR, confirmTargetOrExit, envWithoutPg, opsTarget, runPreflightOrExit } from "./staging-env";

async function main() {
  const target = opsTarget();
  const urlVar = TARGETS[target].migrationVar;
  const url = process.env[urlVar]?.trim();
  if (!url) {
    console.error(`${urlVar} is missing from ${TARGETS[target].envFile} (owner connection of the ${target.toUpperCase()} project).`);
    process.exit(1);
  }
  runPreflightOrExit(`Refusing to migrate: ${target} preflight failed.`, target);

  const apply = process.argv.includes("--apply");
  if (apply) await confirmTargetOrExit("apply database migrations", target);
  console.log(apply ? `\nApplying migrations to ${target.toUpperCase()}…` : "\nDry run (add `-- --apply` to apply):");
  const args = ["supabase", "db", "push", `--remote=${url}`, "--skip-vault", "--workdir", APP_DIR];
  if (!apply) args.push("--dry-run");
  const r = spawnSync("npx", args, { cwd: APP_DIR, stdio: "inherit", env: envWithoutPg() });
  process.exit(r.status ?? 1);
}

void main();
