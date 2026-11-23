/**
 * npm run staging:psql / npm run prod:psql — opens psql as the OWNER of the target database
 * (close-role setup and read-only checks), only after the target's preflight passes; production
 * also asks you to type the production project ref. The connection comes from the target's owner
 * URL variable and is handed to psql through PG* variables (not the command line, not printed);
 * any PG* variable inherited from your shell is dropped first so none can redirect the connection.
 */
import { spawnSync } from "node:child_process";
import { TARGETS } from "./staging-check";
import { confirmTargetOrExit, envWithoutPg, opsTarget, runPreflightOrExit } from "./staging-env";

async function main() {
  const target = opsTarget();
  const urlVar = TARGETS[target].migrationVar;
  const raw = process.env[urlVar]?.trim();
  if (!raw) {
    console.error(`${urlVar} is missing from ${TARGETS[target].envFile} (owner connection of the ${target.toUpperCase()} project).`);
    process.exit(1);
  }
  runPreflightOrExit(`Refusing to open psql: ${target} preflight failed.`, target);
  await confirmTargetOrExit("open an owner psql session", target);

  const u = new URL(raw);
  const env = {
    ...envWithoutPg(),
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || "postgres",
    PGSSLMODE: u.searchParams.get("sslmode") ?? "require",
  };
  console.log(`\nOpening psql on the ${target.toUpperCase()} database (owner). Type \\q to leave.\n`);
  const r = spawnSync("psql", [], { stdio: "inherit", env });
  if (r.error) {
    console.error("psql is not installed. Use the SQL Editor route in docs/STAGING.md step 5 instead.");
    process.exit(1);
  }
  process.exit(r.status ?? 1);
}

void main();
