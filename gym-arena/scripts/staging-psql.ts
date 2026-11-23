/**
 * npm run staging:psql — opens psql as the OWNER of the STAGING database (docs/STAGING.md step 5),
 * only after the staging preflight passes. The connection comes from STAGING_MIGRATION_DATABASE_URL
 * and is handed to psql through PG* variables (not the command line, not printed); any PG*
 * variable inherited from your shell is dropped first so none can redirect the connection.
 */
import { spawnSync } from "node:child_process";
import { envWithoutPg, runPreflightOrExit } from "./staging-env";

const raw = process.env.STAGING_MIGRATION_DATABASE_URL?.trim();
if (!raw) {
  console.error("STAGING_MIGRATION_DATABASE_URL is missing from .env.staging (owner connection of the STAGING project).");
  process.exit(1);
}
runPreflightOrExit("Refusing to open psql: staging preflight failed.");

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
console.log("\nOpening psql on the STAGING database (owner). Type \\q to leave.\n");
const r = spawnSync("psql", [], { stdio: "inherit", env });
if (r.error) {
  console.error("psql is not installed. Use the SQL Editor route in docs/STAGING.md step 5 instead.");
  process.exit(1);
}
process.exit(r.status ?? 1);
