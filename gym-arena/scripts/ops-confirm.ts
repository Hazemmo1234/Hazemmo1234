/**
 * Gate in front of a command that changes the target project (used by prod:create-admin):
 * runs the target's preflight and, for PRODUCTION, asks the operator to type the production
 * project ref. Exits non-zero (so the npm chain stops) unless both pass.
 *
 *   node --env-file=<file> --import tsx scripts/ops-confirm.ts --target=production "<action>"
 */
import { confirmTargetOrExit, opsTarget, runPreflightOrExit } from "./staging-env";

async function main() {
  const target = opsTarget();
  const action = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "change the project";
  runPreflightOrExit(`Refusing to ${action}: ${target} preflight failed.`, target);
  await confirmTargetOrExit(action, target);
}

void main();
