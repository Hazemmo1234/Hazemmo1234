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

/** Port of Supabase's Transaction pooler (Supavisor transaction mode); 5432 on the same host is the Session pooler. */
export const TRANSACTION_POOLER_PORT = "6543";

/**
 * Why a season-close URL cannot be used from the hosting platform, or null. The close runs on
 * Vercel, which cannot reach Supabase's direct database address (`db.<ref>.supabase.co`,
 * IPv6-only), so it must go through the shared Transaction pooler: host `<region>.pooler.supabase.com`,
 * port 6543. The close opens one connection with prepared statements off (src/modules/seasons/close.ts),
 * which is what transaction mode needs. Expects a URL that passed `dbUrlProblem`. The message never
 * contains the URL: only fixed text and the port number.
 */
export function closeTransportProblem(raw: string): string | null {
  const u = new URL(raw);
  if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)) {
    return "must use the Supabase Transaction pooler host (<region>.pooler.supabase.com), not the direct database host — the hosting platform cannot reach the direct address (IPv6 only)";
  }
  if (!u.port) return `must use port ${TRANSACTION_POOLER_PORT} (Transaction pooler); the URL has no port, which means 5432 (the Session pooler)`;
  if (u.port !== TRANSACTION_POOLER_PORT) {
    return `must use port ${TRANSACTION_POOLER_PORT} (Transaction pooler), not port ${u.port}${u.port === "5432" ? " (the Session pooler)" : ""}`;
  }
  return null;
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

export type OpsTarget = "staging" | "production";

/** Variables that exist only for local tests and CI (docs/ENVIRONMENT_VARIABLES.md §3). */
export const TEST_ONLY_VARS = [
  "AUTH_COOKIES_ALLOW_LOCAL_HTTP",
  "NEXT_DIST_DIR",
  "E2E_ALLOW_WRITES",
  "GYM_ARENA_CI_DISPOSABLE",
  "GYM_ARENA_TEST_STACK",
  "TEST_DATABASE_URL",
] as const;

interface TargetSpec {
  envFile: string;
  label: string; // the environment being operated on
  forbiddenVar: string; // ref of the OTHER environment, which must appear nowhere
  forbiddenLabel: string;
  expectedVar?: string; // declared ref the target must equal (production: typed by the operator)
  migrationVar: string;
  forbiddenOriginVar: string;
  originRequired: boolean;
  cronRequired: boolean;
}

export const TARGETS: Record<OpsTarget, TargetSpec> = {
  staging: {
    envFile: ".env.staging",
    label: "staging",
    forbiddenVar: "PRODUCTION_SUPABASE_REF",
    forbiddenLabel: "PRODUCTION",
    migrationVar: "STAGING_MIGRATION_DATABASE_URL",
    forbiddenOriginVar: "PRODUCTION_APP_ORIGIN",
    originRequired: false,
    cronRequired: false,
  },
  production: {
    envFile: ".env.production-ops",
    label: "production",
    forbiddenVar: "STAGING_SUPABASE_REF",
    forbiddenLabel: "STAGING",
    expectedVar: "PRODUCTION_SUPABASE_REF",
    migrationVar: "PRODUCTION_MIGRATION_DATABASE_URL",
    forbiddenOriginVar: "STAGING_APP_ORIGIN",
    originRequired: true,
    cronRequired: true,
  },
};

export function checkStaging(inputs: StagingInputs): CheckResult[] {
  return checkTarget(inputs, "staging");
}

/**
 * Proves every value names the TARGET project and never the other environment's project.
 * Staging: the target is whatever NEXT_PUBLIC_SUPABASE_URL names, and PRODUCTION_SUPABASE_REF
 * must appear nowhere. Production: NEXT_PUBLIC_SUPABASE_URL must name the declared
 * PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF must appear nowhere, and the public address
 * and cron secret are required.
 */
export function checkTarget({ env, linkedRef, fileEnv }: StagingInputs, target: OpsTarget): CheckResult[] {
  const t = TARGETS[target];
  const out: CheckResult[] = [];
  const add = (status: CheckStatus, check: string, detail: string) => out.push({ status, check, detail });
  const v = (name: string) => env[name]?.trim() || undefined;
  const OTHER = t.forbiddenLabel;

  // 0. The values checked are exactly the ones written in the operator file.
  if (fileEnv === null) add("FAIL", t.envFile, "file not found next to package.json");
  else if (fileEnv) {
    const overridden = Object.keys(fileEnv).filter((k) => env[k] !== fileEnv[k]);
    if (overridden.length) {
      add("FAIL", t.envFile, `your shell exports a different value for: ${overridden.join(", ")} — open a new terminal or unset them`);
    } else add("PASS", t.envFile, "every value comes from the file (no shell override)");
  }

  // 1. The other environment's identity must be known, or nothing below can prove separation.
  const forbidden = v(t.forbiddenVar);
  if (!forbidden || !REF.test(forbidden)) {
    add("FAIL", t.forbiddenVar, `set it to the ${OTHER.toLowerCase()} project ref (20 lowercase letters/digits, from that project's URL) so separation can be proved`);
  } else {
    add("PASS", t.forbiddenVar, `${OTHER.toLowerCase()} project ${forbidden} — confirm it matches that dashboard's URL; every check below compares against it`);
  }
  const expected = t.expectedVar ? v(t.expectedVar) : undefined;
  if (t.expectedVar) {
    if (!expected || !REF.test(expected)) add("FAIL", t.expectedVar, `set it to the ${t.label} project ref you are operating on`);
    else if (expected === forbidden) add("FAIL", t.expectedVar, `is the same as ${t.forbiddenVar} — the two environments must be different projects`);
    else add("PASS", t.expectedVar, `${t.label} project ${expected} — confirm it matches the ${t.label} dashboard URL`);
  }

  // 2. Target project ref from the public URL.
  const url = v("NEXT_PUBLIC_SUPABASE_URL");
  const ref = url ? refFromSupabaseUrl(url) : null;
  if (!url) add("FAIL", "NEXT_PUBLIC_SUPABASE_URL", "missing");
  else if (!ref) add("FAIL", "NEXT_PUBLIC_SUPABASE_URL", "not an https://<ref>.supabase.co address — cannot identify the project");
  else if (forbidden && ref === forbidden) add("FAIL", "NEXT_PUBLIC_SUPABASE_URL", `points at ${OTHER} (${ref}) — stop`);
  else if (t.expectedVar && expected && ref !== expected) add("FAIL", "NEXT_PUBLIC_SUPABASE_URL", `names ${ref}, not the declared ${t.expectedVar}`);
  else add("PASS", "NEXT_PUBLIC_SUPABASE_URL", `${t.label} project ${ref}`);

  // 3. API keys belong to the same project (legacy JWT keys carry the ref; new sb_… keys do not).
  const keyCheck = (name: string, role: string, newPrefix: string) => {
    const key = v(name);
    if (!key) return add("FAIL", name, "missing");
    const claims = jwtClaims(key);
    if (claims) {
      if (claims.role !== role) return add("FAIL", name, `is not the ${role} key`);
      if (forbidden && claims.ref === forbidden) return add("FAIL", name, `is a ${OTHER} key — stop`);
      if (ref && claims.ref !== ref) return add("FAIL", name, "belongs to a different project than NEXT_PUBLIC_SUPABASE_URL");
      return add("PASS", name, `${role} key of ${claims.ref}`);
    }
    if (key.startsWith(newPrefix)) {
      return add("WARN", name, `new-format key: its project cannot be read from the key — confirm you copied it from the ${t.label.toUpperCase()} project's API settings`);
    }
    return add("FAIL", name, "not a recognised Supabase key");
  };
  keyCheck("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon", "sb_publishable_");
  keyCheck("SUPABASE_SERVICE_ROLE_KEY", "service_role", "sb_secret_");

  // 4. Close connection: restricted role, target project, never the owner, through the
  //    Transaction pooler (the only address the hosting platform can reach).
  const close = v("SEASON_CLOSE_DATABASE_URL");
  if (!close) add("FAIL", "SEASON_CLOSE_DATABASE_URL", "missing — seasons cannot be closed");
  else {
    const problem = dbUrlProblem(close);
    const db = problem ? null : parseDbUrl(close);
    const transport = problem ? null : closeTransportProblem(close);
    if (problem) add("FAIL", "SEASON_CLOSE_DATABASE_URL", problem);
    else if (!db) add("FAIL", "SEASON_CLOSE_DATABASE_URL", "has no user name");
    else if (db.role !== CLOSE_ROLE) add("FAIL", "SEASON_CLOSE_DATABASE_URL", `must log in as ${CLOSE_ROLE}, not another role`);
    else if (!db.ref) add("FAIL", "SEASON_CLOSE_DATABASE_URL", `cannot identify the project (use the Transaction pooler address, user ${CLOSE_ROLE}.<project-ref>)`);
    else if (forbidden && db.ref === forbidden) add("FAIL", "SEASON_CLOSE_DATABASE_URL", `points at ${OTHER} — stop`);
    else if (ref && db.ref !== ref) add("FAIL", "SEASON_CLOSE_DATABASE_URL", "points at a different project than NEXT_PUBLIC_SUPABASE_URL");
    else if (transport) add("FAIL", "SEASON_CLOSE_DATABASE_URL", transport);
    else add("PASS", "SEASON_CLOSE_DATABASE_URL", `${CLOSE_ROLE} on ${db.ref} (Transaction pooler, port ${TRANSACTION_POOLER_PORT})`);
  }

  // 5. Migration connection (operator only, optional here; required by the migrate/psql commands).
  const mig = v(t.migrationVar);
  if (mig) {
    const problem = dbUrlProblem(mig);
    const db = problem ? null : parseDbUrl(mig);
    if (problem) add("FAIL", t.migrationVar, problem);
    else if (!db || !db.ref) add("FAIL", t.migrationVar, "cannot identify the project (use the Supabase direct or pooler address)");
    else if (forbidden && db.ref === forbidden) add("FAIL", t.migrationVar, `points at ${OTHER} — stop`);
    else if (ref && db.ref !== ref) add("FAIL", t.migrationVar, "points at a different project than NEXT_PUBLIC_SUPABASE_URL");
    else if (db.role === CLOSE_ROLE) add("FAIL", t.migrationVar, `must be the owner (postgres), not ${CLOSE_ROLE}`);
    else add("PASS", t.migrationVar, `owner connection on ${db.ref}`);
  }

  // 6. Cron secret and public origin.
  const cron = v("CRON_SECRET");
  if (!cron) {
    if (t.cronRequired) add("FAIL", "CRON_SECRET", `missing — required in ${t.label} (the nightly snapshot job would be refused)`);
    else add("WARN", "CRON_SECRET", "missing — the nightly snapshot job will be refused (the first TV request of the day still writes it)");
  } else if (cron.length < 16) add("FAIL", "CRON_SECRET", "shorter than 16 characters");
  else add("PASS", "CRON_SECRET", "set (length ok)");

  const origin = v("APP_ORIGIN");
  if (!origin) {
    if (t.originRequired) add("FAIL", "APP_ORIGIN", `missing — required in ${t.label}: the final public https address (TV links are built from it)`);
    else add("PASS", "APP_ORIGIN", "not set — the TV link uses the request's own host (optional)");
  } else {
    let ok = false;
    try {
      const u = new URL(origin);
      ok = u.protocol === "https:" && (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash;
    } catch {
      ok = false;
    }
    const otherOrigin = v(t.forbiddenOriginVar)?.replace(/\/+$/, "");
    if (!ok) add("FAIL", "APP_ORIGIN", "must be an https:// origin with no path, e.g. https://arena-staging.example.com");
    else if (otherOrigin && origin.replace(/\/+$/, "") === otherOrigin) add("FAIL", "APP_ORIGIN", `is the ${OTHER} address — TV links would point at ${OTHER.toLowerCase()}`);
    else add("PASS", "APP_ORIGIN", "https origin");
  }

  // 7. No value anywhere mentions the other environment's project.
  if (forbidden && REF.test(forbidden)) {
    const leaking = Object.entries(env)
      .filter(([k, val]) => k !== t.forbiddenVar && typeof val === "string" && val.includes(forbidden))
      .map(([k]) => k);
    const check = `${OTHER.toLowerCase()} ref`;
    if (leaking.length) add("FAIL", check, `found in: ${leaking.join(", ")}`);
    else add("PASS", check, "appears in no configured value");
  }

  // 8. Test-only switches never belong in an environment's configuration.
  const testOnly = TEST_ONLY_VARS.filter((k) => v(k) !== undefined);
  if (testOnly.length) add("FAIL", "test-only variables", `remove ${testOnly.join(", ")} — they exist only for local tests and CI, never for ${t.label}`);
  else add("PASS", "test-only variables", "none set");

  // 9. A CLI link in this folder must not target the other environment.
  if (linkedRef) {
    const linked = linkedRef.trim();
    if (forbidden && linked === forbidden) add("FAIL", "supabase CLI link", `this folder is linked to ${OTHER} — run \`npx supabase unlink\` first`);
    else add("WARN", "supabase CLI link", `this folder is linked to ${linked}; the ops scripts never use the link (they pass an explicit URL)`);
  }

  return out;
}

export function hasFailure(results: CheckResult[]): boolean {
  return results.some((r) => r.status === "FAIL");
}
