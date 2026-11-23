/**
 * npm run staging:backup / npm run prod:backup — READ-ONLY safety copy of the target database
 * before a migration or a risky operation (docs/ROLLBACK.md). Runs the target's preflight, then
 * `pg_dump --format=custom` over the owner connection, handed to pg_dump through PG* variables
 * (never the command line, never printed). Output: backups/<target>-<UTC timestamp>.dump
 * (git-ignored). Storage objects (photos) are not in the database dump; see docs/ROLLBACK.md.
 * Needs pg_dump at least as new as the server (e.g. `brew install libpq`).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TARGETS } from "./staging-check";
import { APP_DIR, envWithoutPg, opsTarget, runPreflightOrExit } from "./staging-env";

const target = opsTarget();
const urlVar = TARGETS[target].migrationVar;
const raw = process.env[urlVar]?.trim();
if (!raw) {
  console.error(`${urlVar} is missing from ${TARGETS[target].envFile} (owner connection of the ${target.toUpperCase()} project).`);
  process.exit(1);
}
runPreflightOrExit(`Refusing to back up: ${target} preflight failed.`, target);

const u = new URL(raw);
const dir = join(APP_DIR, "backups");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${target}-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
const env = {
  ...envWithoutPg(),
  PGHOST: u.hostname,
  PGPORT: u.port || "5432",
  PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || "postgres",
  PGSSLMODE: u.searchParams.get("sslmode") ?? "require",
};
console.log(`\nDumping the ${target.toUpperCase()} database (read-only) to ${file.replace(APP_DIR + "/", "")} …`);
const r = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--file", file], { stdio: "inherit", env });
if (r.error) {
  console.error("pg_dump is not installed (e.g. `brew install libpq`, then add its bin folder to PATH).");
  process.exit(1);
}
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Backup written: ${statSync(file).size} bytes. Keep it off this laptop too (it holds real data in production).`);
