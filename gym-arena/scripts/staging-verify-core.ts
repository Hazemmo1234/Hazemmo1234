/**
 * Read-only checks of a deployed STAGING site and its Supabase project (docs/STAGING.md step 8).
 * Pure apart from the injected `fetch`: only GET requests, no writes, no sign-in. Results carry
 * status codes and fixed messages only — never a key, a body or a header value beyond the
 * project ref found in the CSP.
 */
import type { CheckResult, CheckStatus } from "./staging-check";

export interface VerifyInputs {
  site: string; // https://… of the staging deployment
  supabaseUrl: string; // staging NEXT_PUBLIC_SUPABASE_URL (preflight-checked)
  anonKey: string;
  stagingRef: string; // the TARGET project ref (staging, or production for prod:verify)
  prodRef: string; // the OTHER environment's ref, which must never appear
  forbiddenLabel?: string; // name of that other environment in messages (default PRODUCTION)
  fetch: typeof fetch;
}

const ANON_DENIED_TABLES = ["members", "profiles", "entries", "attendance", "season_results", "app_settings", "audit_log"];

/** The Supabase project refs named in a Content-Security-Policy value. */
export function cspRefs(csp: string): string[] {
  return [...new Set([...csp.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)].map((m) => m[1]!))];
}

export async function verifyStaging(i: VerifyInputs): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const add = (status: CheckStatus, check: string, detail: string) => out.push({ status, check, detail });
  const site = i.site.replace(/\/+$/, "");
  const supa = i.supabaseUrl.replace(/\/+$/, "");
  const anonHeaders = { apikey: i.anonKey, Authorization: `Bearer ${i.anonKey}` };
  const get = async (url: string, headers: Record<string, string> = {}) => {
    try {
      return await i.fetch(url, { method: "GET", headers, redirect: "manual" });
    } catch {
      return null;
    }
  };

  // 1. The site is up and its build is bound to the STAGING Supabase project (CSP is built from
  //    NEXT_PUBLIC_SUPABASE_URL at build time — next.config.ts).
  const login = await get(`${site}/login`);
  if (!login) add("FAIL", "site /login", "no response");
  else if (login.status !== 200) add("FAIL", "site /login", `HTTP ${login.status} (expected 200)`);
  else {
    add("PASS", "site /login", "HTTP 200");
    const refs = cspRefs(login.headers.get("content-security-policy") ?? "");
    if (refs.includes(i.prodRef)) add("FAIL", "build bound to project", `the deployed CSP names the ${i.forbiddenLabel ?? "PRODUCTION"} project — stop`);
    else if (refs.length === 1 && refs[0] === i.stagingRef) add("PASS", "build bound to project", `CSP names only ${i.stagingRef}`);
    else add("FAIL", "build bound to project", refs.length ? `CSP names ${refs.join(", ")}, expected ${i.stagingRef}` : "no Supabase origin in the CSP (variables missing at build time? Redeploy)");
  }

  // 2. Public endpoints refuse anonymous callers.
  const expectStatus = async (check: string, url: string, expected: number) => {
    const r = await get(url);
    if (!r) return add("FAIL", check, "no response");
    if (r.status !== expected) return add("FAIL", check, `HTTP ${r.status} (expected ${expected})`);
    add("PASS", check, `HTTP ${expected}`);
  };
  await expectStatus("TV state without key", `${site}/api/tv/state`, 401);
  await expectStatus("TV state with a wrong key", `${site}/api/tv/state?key=not-the-key-0000000000000000000000`, 401);
  await expectStatus("cron job without secret", `${site}/api/cron/snapshot`, 401);
  await expectStatus("staff API without session", `${site}/api/me`, 401);

  // 3. Supabase: public sign-up disabled (GoTrue public settings).
  const settings = await get(`${supa}/auth/v1/settings`, { apikey: i.anonKey });
  if (!settings || settings.status !== 200) add("FAIL", "sign-up disabled", `could not read auth settings (HTTP ${settings?.status ?? "none"})`);
  else {
    const body = (await settings.json().catch(() => null)) as { disable_signup?: unknown } | null;
    if (body?.disable_signup === true) add("PASS", "sign-up disabled", "disable_signup = true");
    else add("FAIL", "sign-up disabled", "public sign-up is ENABLED — turn it off (Authentication → Sign In / Providers)");
  }

  // 4. Supabase: the anonymous key reads nothing (grants revoked from anon — migration 3).
  for (const table of ANON_DENIED_TABLES) {
    const r = await get(`${supa}/rest/v1/${table}?select=*&limit=1`, anonHeaders);
    if (!r) add("FAIL", `anon read ${table}`, "no response");
    else if (r.status >= 400) add("PASS", `anon read ${table}`, `refused (HTTP ${r.status})`);
    else add("FAIL", `anon read ${table}`, `HTTP ${r.status} — the anonymous key can read this table`);
  }

  return out;
}
