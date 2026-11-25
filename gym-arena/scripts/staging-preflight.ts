/**
 * npm run staging:preflight / npm run prod:preflight — proves the operator file's settings point
 * at the target Supabase project and never at the other environment, and that no shell variable
 * overrides the file. Prints check names and project refs only, never a value. Exit code 1 on any
 * FAIL. Makes no network connection.
 */
import { opsTarget, runPreflightOrExit } from "./staging-env";

const target = opsTarget();
runPreflightOrExit(`${target === "production" ? "Production" : "Staging"} preflight FAILED — fix the items above before any ${target} step.`, target);
console.log(`\n${target === "production" ? "Production" : "Staging"} preflight passed.`);
