/**
 * Shared by the operator scripts (staging:* and prod:*): runs the isolation check for the target
 * against the current environment AND the contents of its operator file, prints the results
 * (names and project refs only, never a value) and exits on any FAIL. Makes no network connection.
 *
 * Target: `--target=production` on the command line (prod:* scripts); staging otherwise.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseEnv } from "node:util";
import { TARGETS, checkTarget, hasFailure, type OpsTarget } from "./staging-check";

export const APP_DIR = join(__dirname, "..");

/** `--target=production` or `--target=staging` (the default); any other `--target=` value stops the command. */
export function opsTarget(
  argv: string[] = process.argv,
  onError: (message: string) => never = (message) => {
    console.error(message);
    process.exit(1);
  },
): OpsTarget {
  const given = argv.filter((a) => a.startsWith("--target="));
  if (given.length > 1) onError("Give --target only once.");
  if (given.length === 0) return "staging";
  const value = given[0]!.slice("--target=".length);
  if (value === "production" || value === "staging") return value;
  return onError(`Unknown --target=${value} (staging or production).`);
}

export function runPreflightOrExit(failMessage: string, target: OpsTarget = opsTarget()): void {
  const envFile = join(APP_DIR, TARGETS[target].envFile);
  const refFile = join(APP_DIR, "supabase", ".temp", "project-ref");
  const fileEnv = existsSync(envFile) ? (parseEnv(readFileSync(envFile, "utf8")) as Record<string, string>) : null;
  const linkedRef = existsSync(refFile) ? readFileSync(refFile, "utf8") : undefined;

  console.log(`Target: ${target.toUpperCase()} (${TARGETS[target].envFile})\n`);
  const results = checkTarget({ env: process.env, linkedRef, fileEnv }, target);
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.check}: ${r.detail}`);
  if (hasFailure(results)) {
    console.error(`\n${failMessage}`);
    process.exit(1);
  }
}

/**
 * Before a command that changes the PRODUCTION project: the operator types the production
 * project ref (not a secret). Refuses without a terminal. Staging needs no confirmation.
 */
export async function confirmTargetOrExit(action: string, target: OpsTarget = opsTarget()): Promise<void> {
  if (target !== "production") return;
  const ref = process.env.PRODUCTION_SUPABASE_REF?.trim() ?? "";
  if (!process.stdin.isTTY) {
    console.error(`Refusing to ${action} on PRODUCTION without a terminal to confirm in.`);
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`\nAbout to ${action} on PRODUCTION project ${ref}.\nType the production project ref to continue: `)).trim();
  rl.close();
  if (!ref || typed !== ref) {
    console.error("Not confirmed — nothing was changed.");
    process.exit(1);
  }
}

/** The inherited environment without libpq/driver variables that could redirect a connection (PGHOSTADDR, PGSERVICE, …). */
export function envWithoutPg(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG"))) as NodeJS.ProcessEnv;
}
