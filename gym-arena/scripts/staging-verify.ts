/**
 * npm run staging:verify -- https://<staging-site>
 * npm run prod:verify -- https://<production-site>
 *
 * After a deployment: runs the target's preflight (refuses on any FAIL), then read-only checks of
 * the deployed site and its Supabase project (scripts/staging-verify-core.ts). GET requests only;
 * nothing is written; no value is printed.
 */
import { TARGETS, refFromSupabaseUrl } from "./staging-check";
import { opsTarget, runPreflightOrExit } from "./staging-env";
import { verifyStaging } from "./staging-verify-core";

async function main() {
  const target = opsTarget();
  const spec = TARGETS[target];
  const site = process.argv.slice(2).find((a) => !a.startsWith("--"))?.trim();
  let siteUrl: URL | null = null;
  try {
    siteUrl = site ? new URL(site) : null;
  } catch {
    siteUrl = null;
  }
  if (!siteUrl || siteUrl.protocol !== "https:") {
    console.error(`Usage: npm run ${target === "production" ? "prod" : "staging"}:verify -- https://<${target}-site-address>`);
    process.exit(1);
  }
  const otherOrigin = process.env[spec.forbiddenOriginVar]?.trim().replace(/\/+$/, "");
  if (otherOrigin && siteUrl.origin === otherOrigin) {
    console.error(`That is the ${spec.forbiddenLabel} address — refusing.`);
    process.exit(1);
  }
  runPreflightOrExit(`Refusing to verify: ${target} preflight failed.`, target);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  console.log(`\nVerifying ${siteUrl.origin} (read-only)…\n`);
  const results = await verifyStaging({
    site: siteUrl.origin,
    supabaseUrl,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    stagingRef: refFromSupabaseUrl(supabaseUrl)!,
    prodRef: process.env[spec.forbiddenVar]!.trim(),
    forbiddenLabel: spec.forbiddenLabel,
    fetch,
  });
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.check}: ${r.detail}`);
  if (results.some((r) => r.status === "FAIL")) {
    console.error(`\n${target === "production" ? "Production" : "Staging"} verification FAILED.`);
    process.exit(1);
  }
  console.log(`\n${target === "production" ? "Production" : "Staging"} verification passed.`);
}

void main();
