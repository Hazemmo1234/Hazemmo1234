/**
 * Shared by the staging operator scripts: runs the staging isolation check against the current
 * environment AND the contents of .env.staging, prints the results (names and project refs only,
 * never a value) and exits on any FAIL. Makes no network connection.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { checkStaging, hasFailure } from "./staging-check";

export const APP_DIR = join(__dirname, "..");

export function runPreflightOrExit(failMessage: string): void {
  const envFile = join(APP_DIR, ".env.staging");
  const refFile = join(APP_DIR, "supabase", ".temp", "project-ref");
  const fileEnv = existsSync(envFile) ? (parseEnv(readFileSync(envFile, "utf8")) as Record<string, string>) : null;
  const linkedRef = existsSync(refFile) ? readFileSync(refFile, "utf8") : undefined;

  const results = checkStaging({ env: process.env, linkedRef, fileEnv });
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.check}: ${r.detail}`);
  if (hasFailure(results)) {
    console.error(`\n${failMessage}`);
    process.exit(1);
  }
}

/** The inherited environment without libpq/driver variables that could redirect a connection (PGHOSTADDR, PGSERVICE, …). */
export function envWithoutPg(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG"))) as NodeJS.ProcessEnv;
}
