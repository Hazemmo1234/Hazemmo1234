/**
 * npm run staging:verify -- https://<staging-site>
 *
 * After the staging deployment: runs the staging preflight (refuses on any FAIL), then read-only
 * checks of the deployed site and the staging Supabase project (scripts/staging-verify-core.ts).
 * GET requests only; nothing is written; no value is printed.
 */
import { refFromSupabaseUrl } from "./staging-check";
import { runPreflightOrExit } from "./staging-env";
import { verifyStaging } from "./staging-verify-core";

async function main() {
  const site = process.argv[2]?.trim();
  let siteUrl: URL | null = null;
  try {
    siteUrl = site ? new URL(site) : null;
  } catch {
    siteUrl = null;
  }
  if (!siteUrl || siteUrl.protocol !== "https:") {
    console.error("Usage: npm run staging:verify -- https://<staging-site-address>");
    process.exit(1);
  }
  const prodOrigin = process.env.PRODUCTION_APP_ORIGIN?.trim().replace(/\/+$/, "");
  if (prodOrigin && siteUrl.origin === prodOrigin) {
    console.error("That is the PRODUCTION address — refusing.");
    process.exit(1);
  }
  runPreflightOrExit("Refusing to verify: staging preflight failed.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  console.log(`\nVerifying ${siteUrl.origin} (read-only)…\n`);
  const results = await verifyStaging({
    site: siteUrl.origin,
    supabaseUrl,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    stagingRef: refFromSupabaseUrl(supabaseUrl)!,
    prodRef: process.env.PRODUCTION_SUPABASE_REF!.trim(),
    fetch,
  });
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.check}: ${r.detail}`);
  if (results.some((r) => r.status === "FAIL")) {
    console.error("\nStaging verification FAILED.");
    process.exit(1);
  }
  console.log("\nStaging verification passed.");
}

void main();
