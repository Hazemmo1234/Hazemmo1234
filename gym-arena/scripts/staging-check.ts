/**
 * Staging isolation check (pure — no I/O). Proves, from configuration alone, that every value the
 * app or the operator scripts can use points at the STAGING Supabase project and never at
 * production. The app reaches data only through these variables (SYSTEM_ARCHITECTURE; every
 * `process.env` read in src/ is one of them), so if they all name the staging project, staging
 * work cannot touch production data.
 *
 * Output never contains a secret: only project refs (public — they are part of the public
 * Supabase URL) and fixed messages.
 */

export type CheckStatus = "PASS" | "WARN" | "FAIL";
export interface CheckResult {
  status: CheckStatus;
  check: string;
  detail: string;
}

export interface StagingInputs {
  env: Record<string, string | undefined>;
  /** Contents of supabase/.temp/project-ref when the CLI is linked in this folder. */
  linkedRef?: string;
  /**
   * The values written in .env.staging (parsed with Node's own parser), or null when the file
   * is missing. Node's --env-file lets an already-exported shell variable win over the file, so
   * any difference means the checks below would not be checking the file you copy from.
   */
  fileEnv?: Record<string, string> | null;
}

const REF = /^[a-z0-9]{20}$/;
const CLOSE_ROLE = "arena_season_closer";

export function refFromSupabaseUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
    return u.protocol === "https:" && m ? m[1]! : null;
  } catch {
    return null;
  }
}

/**
 * Why a database URL cannot be checked safely, or null. Drivers honour connection settings in
 * the query string — postgres.js takes `?host=` over the URL's host (node_modules/postgres
 * `hosts()`), and libpq/pgx (Supabase CLI) do the same for host/user/port — and accept
 * comma-separated host lists, so only a single plain host with at most `sslmode` is accepted.
 */
export function dbUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "not a postgresql:// URL";
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") return "not a postgresql:// URL";
  const extra = [...u.searchParams.keys()].filter((k) => k !== "sslmode");
  if (extra.length) return "query parameters other than sslmode are not allowed (they can change the host or user)";
  if (u.hostname.includes(",")) return "more than one host is not allowed";
  return null;
}

/** Role and project ref of a Supabase Postgres URL (direct `db.<ref>.supabase.co` or pooler `role.<ref>@<region>.pooler.supabase.com`). */
export function parseDbUrl(raw: string): { role: string; ref: string | null } | null {
  if (dbUrlProblem(raw)) return null;
  const u = new URL(raw);
  const user = decodeURIComponent(u.username);
  if (!user) return null;
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
  if (direct) return { role: user, ref: direct[1]! };
  if (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)) {
    const dot = user.lastIndexOf(".");
    if (dot > 0 && REF.test(user.slice(dot + 1))) return { role: user.slice(0, dot), ref: user.slice(dot + 1) };
    return { role: user, ref: null };
  }
  return { role: user, ref: null };
}

/** `ref` and `role` claims of a legacy Supabase JWT key; `null` for the new sb_… keys or anything else. */
export function jwtClaims(key: string): { ref?: string; role?: string } | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
    return {
      ref: typeof payload.ref === "string" ? payload.ref : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
    };
  } catch {
    return null;
  }
}

export function checkStaging({ env, linkedRef, fileEnv }: StagingInputs): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (status: CheckStatus, check: string, detail: string) => out.push({ status, check, detail });
  const v = (name: string) => env[name]?.trim() || undefined;

  // 0. The values checked are exactly the ones written in .env.staging.
  if (fileEnv === null) add("FAIL", ".env.staging", "file not found next to package.json");
  else if (fileEnv) {
    const overridden = Object.keys(fileEnv).filter((k) => env[k] !== fileEnv[k]);
    if (overridden.length) {
      add("FAIL", ".env.staging", `your shell exports a different value for: ${overridden.join(", ")} — open a new terminal or unset them`);
    } else add("PASS", ".env.staging", "every value comes from the file (no shell override)");
  }

  // 1. Production identity must be known, or nothing below can prove separation.
  const prod = v("PRODUCTION_SUPABASE_REF");
  if (!prod || !REF.test(prod)) {
    add("FAIL", "PRODUCTION_SUPABASE_REF", "set it to the production project ref (20 lowercase letters/digits, from the production project URL) so separation can be proved");
  } else {
    add("PASS", "PRODUCTION_SUPABASE_REF", `production project ${prod} — confirm it matches the production dashboard URL; every check below compares against it`);
  }

  // 2. Staging project ref from the public URL.
  const url = v("NEXT_PUBLIC_SUPABASE_URL");
  const staging = url ? refFromSupabaseUrl(url) : null;
  if (!url) add("FAIL", "NEXT_PUBLIC_SUPABASE_URL", "missing");
  else if (!staging) add("FAIL", "NEXT_PUBLIC_SUPABASE_URL", "not an https://<ref>.supabase.co address — cannot identify the project");
  else if (prod && staging === prod) add("FAIL", "NEXT_PUBLIC_SUPABASE_URL", `points at PRODUCTION (${staging}) — stop`);
  else add("PASS", "NEXT_PUBLIC_SUPABASE_URL", `staging project ${staging}`);

  // 3. API keys belong to the same project (legacy JWT keys carry the ref; new sb_… keys do not).
  const keyCheck = (name: string, role: string, newPrefix: string) => {
    const key = v(name);
    if (!key) return add("FAIL", name, "missing");
    const claims = jwtClaims(key);
    if (claims) {
      if (claims.role !== role) return add("FAIL", name, `is not the ${role} key`);
      if (prod && claims.ref === prod) return add("FAIL", name, "is a PRODUCTION key — stop");
      if (staging && claims.ref !== staging) return add("FAIL", name, "belongs to a different project than NEXT_PUBLIC_SUPABASE_URL");
      return add("PASS", name, `${role} key of ${claims.ref}`);
    }
    if (key.startsWith(newPrefix)) {
      return add("WARN", name, "new-format key: its project cannot be read from the key — confirm you copied it from the STAGING project's API settings");
    }
    return add("FAIL", name, "not a recognised Supabase key");
  };
  keyCheck("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon", "sb_publishable_");
  keyCheck("SUPABASE_SERVICE_ROLE_KEY", "service_role", "sb_secret_");

  // 4. Close connection: restricted role, staging project, never the owner.
  const close = v("SEASON_CLOSE_DATABASE_URL");
  if (!close) add("FAIL", "SEASON_CLOSE_DATABASE_URL", "missing — seasons cannot be closed");
  else {
    const problem = dbUrlProblem(close);
    const db = problem ? null : parseDbUrl(close);
    if (problem) add("FAIL", "SEASON_CLOSE_DATABASE_URL", problem);
    else if (!db) add("FAIL", "SEASON_CLOSE_DATABASE_URL", "has no user name");
    else if (db.role !== CLOSE_ROLE) add("FAIL", "SEASON_CLOSE_DATABASE_URL", `must log in as ${CLOSE_ROLE}, not another role`);
    else if (!db.ref) add("FAIL", "SEASON_CLOSE_DATABASE_URL", "cannot identify the project (use the Supabase direct or pooler address)");
    else if (prod && db.ref === prod) add("FAIL", "SEASON_CLOSE_DATABASE_URL", "points at PRODUCTION — stop");
    else if (staging && db.ref !== staging) add("FAIL", "SEASON_CLOSE_DATABASE_URL", "points at a different project than NEXT_PUBLIC_SUPABASE_URL");
    else add("PASS", "SEASON_CLOSE_DATABASE_URL", `${CLOSE_ROLE} on ${db.ref}`);
  }

  // 5. Migration connection (operator only, optional here; required by staging-migrate).
  const mig = v("STAGING_MIGRATION_DATABASE_URL");
  if (mig) {
    const problem = dbUrlProblem(mig);
    const db = problem ? null : parseDbUrl(mig);
    if (problem) add("FAIL", "STAGING_MIGRATION_DATABASE_URL", problem);
    else if (!db || !db.ref) add("FAIL", "STAGING_MIGRATION_DATABASE_URL", "cannot identify the project (use the Supabase direct or pooler address)");
    else if (prod && db.ref === prod) add("FAIL", "STAGING_MIGRATION_DATABASE_URL", "points at PRODUCTION — stop");
    else if (staging && db.ref !== staging) add("FAIL", "STAGING_MIGRATION_DATABASE_URL", "points at a different project than NEXT_PUBLIC_SUPABASE_URL");
    else if (db.role === CLOSE_ROLE) add("FAIL", "STAGING_MIGRATION_DATABASE_URL", `must be the owner (postgres), not ${CLOSE_ROLE}`);
    else add("PASS", "STAGING_MIGRATION_DATABASE_URL", `owner connection on ${db.ref}`);
  }

  // 6. Cron secret and public origin.
  const cron = v("CRON_SECRET");
  if (!cron) add("WARN", "CRON_SECRET", "missing — the nightly snapshot job will be refused (the first TV request of the day still writes it)");
  else if (cron.length < 16) add("FAIL", "CRON_SECRET", "shorter than 16 characters");
  else add("PASS", "CRON_SECRET", "set (length ok)");

  const origin = v("APP_ORIGIN");
  if (!origin) add("PASS", "APP_ORIGIN", "not set — the TV link uses the request's own host (optional)");
  else {
    let ok = false;
    try {
      const u = new URL(origin);
      ok = u.protocol === "https:" && (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash;
    } catch {
      ok = false;
    }
    const prodOrigin = v("PRODUCTION_APP_ORIGIN")?.replace(/\/+$/, "");
    if (!ok) add("FAIL", "APP_ORIGIN", "must be an https:// origin with no path, e.g. https://arena-staging.example.com");
    else if (prodOrigin && origin.replace(/\/+$/, "") === prodOrigin) add("FAIL", "APP_ORIGIN", "is the PRODUCTION address — TV links would point at production");
    else add("PASS", "APP_ORIGIN", "https origin");
  }

  // 7. No value anywhere mentions the production project.
  if (prod && REF.test(prod)) {
    const leaking = Object.entries(env)
      .filter(([k, val]) => k !== "PRODUCTION_SUPABASE_REF" && typeof val === "string" && val.includes(prod))
      .map(([k]) => k);
    if (leaking.length) add("FAIL", "production ref", `found in: ${leaking.join(", ")}`);
    else add("PASS", "production ref", "appears in no configured value");
  }

  // 8. A CLI link in this folder must not target production.
  if (linkedRef) {
    const ref = linkedRef.trim();
    if (prod && ref === prod) add("FAIL", "supabase CLI link", "this folder is linked to PRODUCTION — run `npx supabase unlink` first");
    else add("WARN", "supabase CLI link", `this folder is linked to ${ref}; staging scripts never use the link (they pass an explicit URL)`);
  }

  return out;
}

export function hasFailure(results: CheckResult[]): boolean {
  return results.some((r) => r.status === "FAIL");
}
