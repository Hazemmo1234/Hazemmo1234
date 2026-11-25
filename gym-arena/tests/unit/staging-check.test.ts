import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TARGETS,
  TRANSACTION_POOLER_PORT,
  checkStaging,
  checkTarget,
  closeTransportProblem,
  dbUrlProblem,
  hasFailure,
  jwtClaims,
  parseDbUrl,
  refFromSupabaseUrl,
} from "../../scripts/staging-check";

const PROD = "prodprodprodprodprod";
const STG = "stagstagstagstagstag";
const OTHER = "otherotherotherother";

const jwt = (payload: object) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

const good = (): Record<string, string> => ({
  PRODUCTION_SUPABASE_REF: PROD,
  NEXT_PUBLIC_SUPABASE_URL: `https://${STG}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ iss: "supabase", ref: STG, role: "anon" }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({ iss: "supabase", ref: STG, role: "service_role" }),
  SEASON_CLOSE_DATABASE_URL: `postgresql://arena_season_closer.${STG}:s3cret-value@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  STAGING_MIGRATION_DATABASE_URL: `postgresql://postgres:0wner-pass@db.${STG}.supabase.co:5432/postgres`,
  CRON_SECRET: "0123456789abcdef-cron",
});

const byCheck = (env: Record<string, string | undefined>, linkedRef?: string) =>
  Object.fromEntries(checkStaging({ env, linkedRef }).map((r) => [r.check, r]));

describe("staging isolation check", () => {
  it("passes a fully staging configuration and never echoes a secret", () => {
    const env = good();
    const results = checkStaging({ env });
    expect(hasFailure(results)).toBe(false);
    const text = JSON.stringify(results);
    for (const secret of ["s3cret-value", "0wner-pass", "0123456789abcdef-cron", env.SUPABASE_SERVICE_ROLE_KEY!]) expect(text).not.toContain(secret);
  });

  it("refuses without the production ref (separation cannot be proved)", () => {
    const env = good();
    delete (env as Record<string, string | undefined>).PRODUCTION_SUPABASE_REF;
    expect(byCheck(env).PRODUCTION_SUPABASE_REF!.status).toBe("FAIL");
  });

  it("refuses a production URL, production keys and production database URLs", () => {
    const env = good();
    env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROD}.supabase.co`;
    expect(byCheck(env).NEXT_PUBLIC_SUPABASE_URL!.status).toBe("FAIL");

    const env2 = good();
    env2.SUPABASE_SERVICE_ROLE_KEY = jwt({ ref: PROD, role: "service_role" });
    expect(byCheck(env2).SUPABASE_SERVICE_ROLE_KEY!.detail).toContain("PRODUCTION");

    const env3 = good();
    env3.SEASON_CLOSE_DATABASE_URL = `postgresql://arena_season_closer:x@db.${PROD}.supabase.co:5432/postgres`;
    env3.STAGING_MIGRATION_DATABASE_URL = `postgresql://postgres.${PROD}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
    const r = byCheck(env3);
    expect(r.SEASON_CLOSE_DATABASE_URL!.status).toBe("FAIL");
    expect(r.STAGING_MIGRATION_DATABASE_URL!.status).toBe("FAIL");
    expect(r["production ref"]!.status).toBe("FAIL");
  });

  it("refuses values that mix projects or use the wrong role", () => {
    const env = good();
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = jwt({ ref: OTHER, role: "anon" });
    env.SEASON_CLOSE_DATABASE_URL = `postgresql://postgres:x@db.${STG}.supabase.co:5432/postgres`;
    env.STAGING_MIGRATION_DATABASE_URL = `postgresql://arena_season_closer:x@db.${STG}.supabase.co:5432/postgres`;
    const r = byCheck(env);
    expect(r.NEXT_PUBLIC_SUPABASE_ANON_KEY!.status).toBe("FAIL");
    expect(r.SEASON_CLOSE_DATABASE_URL!.detail).toContain("arena_season_closer");
    expect(r.STAGING_MIGRATION_DATABASE_URL!.status).toBe("FAIL");

    const env2 = good();
    env2.SUPABASE_SERVICE_ROLE_KEY = jwt({ ref: STG, role: "anon" }); // anon key pasted as service key
    expect(byCheck(env2).SUPABASE_SERVICE_ROLE_KEY!.status).toBe("FAIL");

    const env3 = good();
    env3.SEASON_CLOSE_DATABASE_URL = `postgresql://arena_season_closer:x@db.${OTHER}.supabase.co:5432/postgres`;
    expect(byCheck(env3).SEASON_CLOSE_DATABASE_URL!.status).toBe("FAIL");
  });

  it("warns (does not pass silently) on new-format keys whose project cannot be read", () => {
    const env = good();
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_abc";
    env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_abc";
    const r = byCheck(env);
    expect(r.NEXT_PUBLIC_SUPABASE_ANON_KEY!.status).toBe("WARN");
    expect(r.SUPABASE_SERVICE_ROLE_KEY!.status).toBe("WARN");
    env.SUPABASE_SERVICE_ROLE_KEY = "garbage";
    expect(byCheck(env).SUPABASE_SERVICE_ROLE_KEY!.status).toBe("FAIL");
  });

  it("checks missing values, the cron secret and APP_ORIGIN", () => {
    const r0 = byCheck({ PRODUCTION_SUPABASE_REF: PROD });
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SEASON_CLOSE_DATABASE_URL"]) expect(r0[k]!.status).toBe("FAIL");
    expect(r0.CRON_SECRET!.status).toBe("WARN");
    expect(r0.APP_ORIGIN!.status).toBe("PASS"); // optional

    const env = good();
    env.CRON_SECRET = "short";
    env.APP_ORIGIN = "http://arena-staging.example.com/path";
    let r = byCheck(env);
    expect(r.CRON_SECRET!.status).toBe("FAIL");
    expect(r.APP_ORIGIN!.status).toBe("FAIL");

    env.APP_ORIGIN = "https://arena.example.com/";
    env.PRODUCTION_APP_ORIGIN = "https://arena.example.com";
    r = byCheck(env);
    expect(r.APP_ORIGIN!.detail).toContain("PRODUCTION");

    env.APP_ORIGIN = "https://arena-staging.example.com";
    expect(byCheck(env).APP_ORIGIN!.status).toBe("PASS");
    env.APP_ORIGIN = "not a url";
    expect(byCheck(env).APP_ORIGIN!.status).toBe("FAIL");
  });

  it("refuses a CLI link to production and warns on any other link", () => {
    expect(byCheck(good(), `${PROD}\n`)["supabase CLI link"]!.status).toBe("FAIL");
    expect(byCheck(good(), STG)["supabase CLI link"]!.status).toBe("WARN");
  });

  it("parses Supabase addresses and keys", () => {
    expect(refFromSupabaseUrl(`https://${STG}.supabase.co/`)).toBe(STG);
    expect(refFromSupabaseUrl(`http://${STG}.supabase.co`)).toBeNull();
    expect(refFromSupabaseUrl("https://example.com")).toBeNull();
    expect(refFromSupabaseUrl("nope")).toBeNull();
    expect(parseDbUrl("https://x")).toBeNull();
    expect(parseDbUrl("nope")).toBeNull();
    expect(parseDbUrl("postgresql://@db.x.supabase.co/postgres")).toBeNull();
    expect(parseDbUrl("postgresql://u:p@localhost:5432/postgres")).toEqual({ role: "u", ref: null });
    expect(parseDbUrl("postgresql://postgres:p@aws-0-x.pooler.supabase.com:6543/postgres")).toEqual({ role: "postgres", ref: null });
    expect(parseDbUrl(`postgres://arena_season_closer.${STG}:p@aws-1-x.pooler.supabase.com:6543/postgres`)).toEqual({ role: "arena_season_closer", ref: STG });
    expect(jwtClaims("a.b")).toBeNull();
    expect(jwtClaims("a.!!!.c")).toBeNull();
    expect(jwtClaims(jwt({ ref: 1, role: 2 }))).toEqual({ ref: undefined, role: undefined });
  });

  it("refuses close and migration URLs whose project cannot be identified", () => {
    const env = good();
    env.SEASON_CLOSE_DATABASE_URL = "postgresql://arena_season_closer:x@localhost:5432/postgres";
    env.STAGING_MIGRATION_DATABASE_URL = "postgresql://postgres:x@localhost:5432/postgres";
    const r = byCheck(env);
    expect(r.SEASON_CLOSE_DATABASE_URL!.status).toBe("FAIL");
    expect(r.STAGING_MIGRATION_DATABASE_URL!.status).toBe("FAIL");
    env.SEASON_CLOSE_DATABASE_URL = "mysql://x";
    expect(byCheck(env).SEASON_CLOSE_DATABASE_URL!.detail).toContain("postgresql");
  });

  it("refuses database URLs whose query string or host list could redirect the connection", () => {
    // postgres.js and libpq/pgx honour ?host=, ?user=, ?port= over the visible address
    const pooler = `postgresql://arena_season_closer.${STG}:x@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
    for (const bad of [`${pooler}?host=10.0.0.1`, `${pooler}?user=postgres`, `${pooler}?port=5433`, `${pooler}?sslmode=require&host=x`]) {
      const env = good();
      env.SEASON_CLOSE_DATABASE_URL = bad;
      env.STAGING_MIGRATION_DATABASE_URL = bad.replace("arena_season_closer", "postgres");
      const r = byCheck(env);
      expect(r.SEASON_CLOSE_DATABASE_URL!.detail).toContain("query parameters");
      expect(r.STAGING_MIGRATION_DATABASE_URL!.detail).toContain("query parameters");
    }
    const env = good();
    env.SEASON_CLOSE_DATABASE_URL = `${pooler}?sslmode=require`;
    expect(byCheck(env).SEASON_CLOSE_DATABASE_URL!.status).toBe("PASS");
    env.SEASON_CLOSE_DATABASE_URL = `postgresql://arena_season_closer.${STG}:x@10.0.0.1,aws-0-x.pooler.supabase.com:6543/postgres`;
    expect(byCheck(env).SEASON_CLOSE_DATABASE_URL!.status).toBe("FAIL");
    env.SEASON_CLOSE_DATABASE_URL = `postgresql://arena_season_closer.${STG}:x@evil.example.com/x.pooler.supabase.com:6543/postgres`;
    expect(byCheck(env).SEASON_CLOSE_DATABASE_URL!.status).toBe("FAIL");
    expect(dbUrlProblem("postgresql://u:p@db.x.supabase.co/postgres")).toBeNull();
    expect(dbUrlProblem("postgresql://u:p@h1,h2/postgres")).not.toBeNull();
    env.SEASON_CLOSE_DATABASE_URL = `postgresql://:x@db.${STG}.supabase.co:5432/postgres`;
    expect(byCheck(env).SEASON_CLOSE_DATABASE_URL!.detail).toContain("user name");
  });

  describe("close URL goes through the Transaction pooler (host <region>.pooler.supabase.com, port 6543)", () => {
    const POOLER = "aws-0-eu-central-1.pooler.supabase.com";
    const closeUrl = (user: string, hostPort: string) => `postgresql://${user}:s3cret-value@${hostPort}/postgres`;
    /** The close check for this URL; the results must never contain the password, the host or the URL. */
    const closeCheck = (url: string) => {
      const env = good();
      env.SEASON_CLOSE_DATABASE_URL = url;
      const results = checkStaging({ env });
      const text = JSON.stringify(results);
      for (const leak of ["s3cret-value", POOLER, `db.${STG}.supabase.co`, url]) expect(text).not.toContain(leak);
      return Object.fromEntries(results.map((r) => [r.check, r])).SEASON_CLOSE_DATABASE_URL!;
    };

    it("passes the restricted role on the Transaction pooler, port 6543", () => {
      const r = closeCheck(closeUrl(`arena_season_closer.${STG}`, `${POOLER}:6543`));
      expect(r.status).toBe("PASS");
      expect(r.detail).toBe(`arena_season_closer on ${STG} (Transaction pooler, port 6543)`);
      expect(closeCheck(closeUrl(`arena_season_closer.${STG}`, "aws-1-us-east-1.pooler.supabase.com:6543")).status).toBe("PASS");
    });

    it("refuses the restricted role on the direct database host, on any port", () => {
      for (const port of ["5432", "6543", ""]) {
        const r = closeCheck(closeUrl("arena_season_closer", `db.${STG}.supabase.co${port ? `:${port}` : ""}`));
        expect(r.status).toBe("FAIL");
        expect(r.detail).toContain("not the direct database host");
      }
    });

    it("refuses the restricted role on the pooler host with any port other than 6543", () => {
      const session = closeCheck(closeUrl(`arena_season_closer.${STG}`, `${POOLER}:5432`));
      expect(session.status).toBe("FAIL");
      expect(session.detail).toBe("must use port 6543 (Transaction pooler), not port 5432 (the Session pooler)");
      const other = closeCheck(closeUrl(`arena_season_closer.${STG}`, `${POOLER}:6544`));
      expect(other.status).toBe("FAIL");
      expect(other.detail).toBe("must use port 6543 (Transaction pooler), not port 6544");
      const none = closeCheck(closeUrl(`arena_season_closer.${STG}`, POOLER));
      expect(none.status).toBe("FAIL");
      expect(none.detail).toContain("no port");
    });

    it("refuses the owner role even on the Transaction pooler, port 6543", () => {
      for (const owner of [`postgres.${STG}`, "postgres"]) {
        const r = closeCheck(closeUrl(owner, `${POOLER}:6543`));
        expect(r.status).toBe("FAIL");
        expect(r.detail).toContain("must log in as arena_season_closer");
      }
    });

    it("refuses malformed URLs", () => {
      for (const bad of [
        "not a url",
        "postgresql://",
        `arena_season_closer.${STG}:s3cret-value@${POOLER}:6543/postgres`, // no scheme
        `https://arena_season_closer.${STG}:s3cret-value@${POOLER}:6543/postgres`, // not postgres
        `postgresql://arena_season_closer.${STG}:s3cret-value@${POOLER}:6543,${POOLER}:6543/postgres`, // host list
      ]) {
        expect(closeCheck(bad).status, bad.replace("s3cret-value", "***")).toBe("FAIL");
      }
    });

    it("exposes the rule as a pure function", () => {
      expect(TRANSACTION_POOLER_PORT).toBe("6543");
      expect(closeTransportProblem(closeUrl(`arena_season_closer.${STG}`, `${POOLER}:6543`))).toBeNull();
      expect(closeTransportProblem(closeUrl("arena_season_closer", `db.${STG}.supabase.co:6543`))).toContain("not the direct database host");
      expect(closeTransportProblem(closeUrl(`arena_season_closer.${STG}`, `${POOLER}:5432`))).toContain("not port 5432");
    });

    it("matches the close connection: one connection, prepared statements off (what transaction mode needs)", () => {
      const src = readFileSync(join(__dirname, "..", "..", "src", "modules", "seasons", "close.ts"), "utf8");
      const options = src.match(/postgres\(url, \{(.*)\}\);/); // the options object, on one line
      expect(options, "close.ts opens its connection with postgres(url, { … })").not.toBeNull();
      expect(options![1]).toMatch(/\bmax: 1\b/);
      expect(options![1]).toMatch(/\bprepare: false\b/);
    });
  });

  it("checks exactly the values written in .env.staging (a shell export must not override them)", () => {
    const file = good();
    expect(byCheckFile({ ...file }, file)[".env.staging"]!.status).toBe("PASS");
    const shell = { ...file, NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co` };
    const r = byCheckFile(shell, file);
    expect(r[".env.staging"]!.status).toBe("FAIL");
    expect(r[".env.staging"]!.detail).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(r[".env.staging"]!.detail).not.toContain(OTHER);
    expect(byCheckFile(file, null)[".env.staging"]!.status).toBe("FAIL");
  });

  it("shows the production ref it compares against", () => {
    expect(byCheck(good()).PRODUCTION_SUPABASE_REF).toMatchObject({ status: "PASS", detail: expect.stringContaining(PROD) });
  });
});

const byCheckFile = (env: Record<string, string>, fileEnv: Record<string, string> | null) =>
  Object.fromEntries(checkStaging({ env, fileEnv }).map((r) => [r.check, r]));

describe("production target", () => {
  const prodJwt = (role: string) => jwt({ iss: "supabase", ref: PROD, role });
  const prodEnv = (): Record<string, string> => ({
    PRODUCTION_SUPABASE_REF: PROD,
    STAGING_SUPABASE_REF: STG,
    STAGING_APP_ORIGIN: "https://arena-staging.example.com",
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: prodJwt("anon"),
    SUPABASE_SERVICE_ROLE_KEY: prodJwt("service_role"),
    SEASON_CLOSE_DATABASE_URL: `postgresql://arena_season_closer.${PROD}:closer-pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    PRODUCTION_MIGRATION_DATABASE_URL: `postgresql://postgres.${PROD}:owner-pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    CRON_SECRET: "prod-cron-secret-0123456789",
    APP_ORIGIN: "https://arena.example.com",
  });
  const run = (env: Record<string, string | undefined>, fileEnv?: Record<string, string> | null) =>
    Object.fromEntries(checkTarget({ env, fileEnv }, "production").map((r) => [r.check, r]));

  it("passes a production configuration and never echoes a secret", () => {
    const results = checkTarget({ env: prodEnv() }, "production");
    expect(hasFailure(results)).toBe(false);
    const text = JSON.stringify(results);
    for (const secret of ["closer-pw", "owner-pw", "prod-cron-secret-0123456789"]) expect(text).not.toContain(secret);
    expect(TARGETS.production.envFile).toBe(".env.production-ops");
    expect(run(prodEnv(), prodEnv())[".env.production-ops"]!.status).toBe("PASS");
    expect(run(prodEnv(), null)[".env.production-ops"]!.status).toBe("FAIL");
  });

  it("requires the close URL to go through the Transaction pooler, port 6543, as in staging", () => {
    expect(run(prodEnv()).SEASON_CLOSE_DATABASE_URL!.detail).toBe(`arena_season_closer on ${PROD} (Transaction pooler, port 6543)`);
    const e = prodEnv();
    e.SEASON_CLOSE_DATABASE_URL = `postgresql://arena_season_closer:closer-pw@db.${PROD}.supabase.co:5432/postgres`;
    const direct = run(e).SEASON_CLOSE_DATABASE_URL!;
    expect(direct.status).toBe("FAIL");
    expect(direct.detail).toContain("not the direct database host");
    e.SEASON_CLOSE_DATABASE_URL = `postgresql://arena_season_closer.${PROD}:closer-pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
    expect(run(e).SEASON_CLOSE_DATABASE_URL!.detail).toContain("not port 5432");
    expect(JSON.stringify(checkTarget({ env: e }, "production"))).not.toContain("closer-pw");
  });

  it("refuses any staging value in a production run", () => {
    const e = prodEnv();
    e.NEXT_PUBLIC_SUPABASE_URL = `https://${STG}.supabase.co`;
    expect(run(e).NEXT_PUBLIC_SUPABASE_URL!.detail).toContain("STAGING");
    const e2 = prodEnv();
    e2.SUPABASE_SERVICE_ROLE_KEY = jwt({ ref: STG, role: "service_role" });
    expect(run(e2).SUPABASE_SERVICE_ROLE_KEY!.detail).toContain("STAGING");
    const e3 = prodEnv();
    e3.PRODUCTION_MIGRATION_DATABASE_URL = `postgresql://postgres.${STG}:x@aws-0-x.pooler.supabase.com:5432/postgres`;
    const r3 = run(e3);
    expect(r3.PRODUCTION_MIGRATION_DATABASE_URL!.status).toBe("FAIL");
    expect(r3["staging ref"]!.status).toBe("FAIL");
    const e4 = prodEnv();
    e4.APP_ORIGIN = "https://arena-staging.example.com";
    expect(run(e4).APP_ORIGIN!.detail).toContain("STAGING");
  });

  it("requires the URL to name the declared production ref, and the two refs to differ", () => {
    const e = prodEnv();
    e.NEXT_PUBLIC_SUPABASE_URL = `https://${OTHER}.supabase.co`;
    expect(run(e).NEXT_PUBLIC_SUPABASE_URL!.detail).toContain("not the declared PRODUCTION_SUPABASE_REF");
    const e2 = prodEnv();
    e2.STAGING_SUPABASE_REF = PROD;
    expect(run(e2).PRODUCTION_SUPABASE_REF!.status).toBe("FAIL");
    const e3 = prodEnv();
    delete (e3 as Record<string, string | undefined>).PRODUCTION_SUPABASE_REF;
    delete (e3 as Record<string, string | undefined>).STAGING_SUPABASE_REF;
    const r3 = run(e3);
    expect(r3.PRODUCTION_SUPABASE_REF!.status).toBe("FAIL");
    expect(r3.STAGING_SUPABASE_REF!.status).toBe("FAIL");
  });

  it("requires the public address and the cron secret in production", () => {
    const e = prodEnv();
    delete (e as Record<string, string | undefined>).APP_ORIGIN;
    delete (e as Record<string, string | undefined>).CRON_SECRET;
    const r = run(e);
    expect(r.APP_ORIGIN!.status).toBe("FAIL");
    expect(r.CRON_SECRET!.status).toBe("FAIL");
    // staging keeps them optional
    const s = good();
    delete (s as Record<string, string | undefined>).CRON_SECRET;
    expect(byCheck(s).CRON_SECRET!.status).toBe("WARN");
  });

  it("refuses a CLI link to staging during production work", () => {
    expect(Object.fromEntries(checkTarget({ env: prodEnv(), linkedRef: STG }, "production").map((r) => [r.check, r]))["supabase CLI link"]!.status).toBe("FAIL");
  });
});

describe("the two targets cannot be confused", () => {
  const prodJwt = (role: string) => jwt({ ref: PROD, role });
  const productionFile = (): Record<string, string> => ({
    PRODUCTION_SUPABASE_REF: PROD,
    STAGING_SUPABASE_REF: STG,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: prodJwt("anon"),
    SUPABASE_SERVICE_ROLE_KEY: prodJwt("service_role"),
    SEASON_CLOSE_DATABASE_URL: `postgresql://arena_season_closer.${PROD}:x@aws-0-x.pooler.supabase.com:6543/postgres`,
    PRODUCTION_MIGRATION_DATABASE_URL: `postgresql://postgres.${PROD}:x@aws-0-x.pooler.supabase.com:5432/postgres`,
    CRON_SECRET: "c".repeat(24),
    APP_ORIGIN: "https://arena.example.com",
  });

  it("production values run as a STAGING operation are refused", () => {
    const results = checkTarget({ env: productionFile() }, "staging");
    expect(hasFailure(results)).toBe(true);
    const r = Object.fromEntries(results.map((x) => [x.check, x]));
    expect(r.NEXT_PUBLIC_SUPABASE_URL!.detail).toContain("PRODUCTION");
    expect(r.SEASON_CLOSE_DATABASE_URL!.detail).toContain("PRODUCTION");
  });

  it("staging values run as a PRODUCTION operation are refused", () => {
    const staging = { ...good(), STAGING_SUPABASE_REF: STG };
    const results = checkTarget({ env: staging }, "production");
    expect(hasFailure(results)).toBe(true);
    const r = Object.fromEntries(results.map((x) => [x.check, x]));
    expect(r.NEXT_PUBLIC_SUPABASE_URL!.detail).toContain("STAGING");
  });

  it("a staging file without the production declarations cannot pass as production", () => {
    expect(hasFailure(checkTarget({ env: good() }, "production"))).toBe(true);
  });

  it("each target compares against its own operator file", () => {
    const prod = productionFile();
    expect(TARGETS.staging.envFile).not.toBe(TARGETS.production.envFile);
    // production values loaded, but the staging command reads .env.staging: every key differs
    const r = Object.fromEntries(checkTarget({ env: prod, fileEnv: good() }, "staging").map((x) => [x.check, x]));
    expect(r[".env.staging"]!.status).toBe("FAIL");
  });
});

describe("target selection", () => {
  it("is staging unless --target=production is given exactly", async () => {
    const { opsTarget } = await import("../../scripts/staging-env");
    expect(opsTarget(["node", "x"])).toBe("staging");
    expect(opsTarget(["node", "x", "--target=production"])).toBe("production");
    expect(opsTarget(["node", "x", "--target=staging"])).toBe("staging");
    expect(opsTarget(["node", "x", "production"])).toBe("staging"); // a bare word is not a target flag
    const thrower = (m: string): never => {
      throw new Error(m);
    };
    expect(() => opsTarget(["node", "x", "--target=prod"], thrower)).toThrow(/Unknown --target=prod/);
    expect(() => opsTarget(["node", "x", "--target=production", "--target=staging"], thrower)).toThrow(/only once/);
  });
});

describe("test-only variables", () => {
  it.each(["AUTH_COOKIES_ALLOW_LOCAL_HTTP", "NEXT_DIST_DIR", "E2E_ALLOW_WRITES", "GYM_ARENA_CI_DISPOSABLE", "GYM_ARENA_TEST_STACK", "TEST_DATABASE_URL"])(
    "%s in an operator file is refused for both targets",
    (name) => {
      const s = { ...good(), [name]: "1" };
      const r = Object.fromEntries(checkTarget({ env: s }, "staging").map((x) => [x.check, x]));
      expect(r["test-only variables"]!.status).toBe("FAIL");
      expect(r["test-only variables"]!.detail).toContain(name);
      expect(r["test-only variables"]!.detail).not.toContain("=1");
    },
  );
  it("passes when none is set", () => {
    expect(Object.fromEntries(checkTarget({ env: good() }, "staging").map((x) => [x.check, x]))["test-only variables"]!.status).toBe("PASS");
  });
});
