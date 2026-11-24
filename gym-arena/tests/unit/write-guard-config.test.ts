import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkE2eRun, checkE2eTarget } from "../../e2e/global-setup";
import { LOCAL_JWT_SECRET, PROJECT_LABEL, type ContainerInfo, type IdentityProbe } from "../support/stack-identity";

// Central write guard: the runners — not individual tests — enforce the gate.
//  - Playwright: globalSetup (and, independently of the configuration, the worker fixture in
//    e2e/fixtures.ts) refuses remote mode, allows browser runs only in CI, verifies the actual
//    stack and attests the served build before ANY test; @writes tests also need the opt-in
//    E2E_ALLOW_WRITES=1 (config grepInvert).
//  - Vitest DB: globalSetup verifies the actual stack once; setupFiles re-checks in every worker
//    before every test file, whether or not the file imports the helpers.

const ROOT = join(__dirname, "..", "..");
const VALID = {
  GYM_ARENA_TEST_STACK: "gym-arena-ci",
  GYM_ARENA_CI_DISPOSABLE: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58321",
  TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres",
};
/** the same, inside a CI job (GITHUB_ACTIONS=true: accident prevention, not authentication) */
const CI_RUN = { ...VALID, GITHUB_ACTIONS: "true" };
/** a probe that sees exactly the verified CI stack */
const ciProbe: IdentityProbe = {
  async inspect(name): Promise<ContainerInfo> {
    const labels = { [PROJECT_LABEL]: "gym-arena-ci" };
    if (name === "supabase_db_gym-arena-ci") {
      return { name, running: true, image: "public.ecr.aws/supabase/postgres:17", labels, ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "58322" }] }, mounts: [{ Type: "volume", Name: "supabase_db_gym-arena-ci", Destination: "/var/lib/postgresql/data" }] };
    }
    if (name === "supabase_kong_gym-arena-ci") {
      return { name, running: true, image: "public.ecr.aws/supabase/kong:2.8.1", labels, ports: { "8000/tcp": [{ HostIp: "0.0.0.0", HostPort: "58321" }] }, mounts: [] };
    }
    throw new Error(`No such container: ${name}`);
  },
  containerSystemId: async () => "7400000000000000001",
  urlIdentity: async () => ({ systemId: "7400000000000000001", jwtSecret: LOCAL_JWT_SECRET }),
};
const noStack: IdentityProbe = { ...ciProbe, inspect: async (n) => { throw new Error(`No such container: ${n}`); } };

const saved = { ...process.env };
beforeEach(() => vi.resetModules());
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe("Playwright: central guard and opt-in", () => {
  async function config(env: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return (await import("../../playwright.config")).default;
  }

  it("the global setup is the central guard, for every project", async () => {
    const c = await config({ E2E_ALLOW_WRITES: undefined });
    expect(c.globalSetup).toBe("./e2e/global-setup.ts");
    expect(c.projects?.length).toBeGreaterThan(0);
    for (const p of c.projects ?? []) {
      expect(p).not.toHaveProperty("grep");
      expect(p).not.toHaveProperty("grepInvert");
    }
  });
  it("missing opt-in: @writes tests are excluded", async () => {
    expect((await config({ E2E_ALLOW_WRITES: undefined })).grepInvert).toEqual(/@writes/);
    expect((await config({ E2E_ALLOW_WRITES: "true" })).grepInvert).toEqual(/@writes/);
  });
  it("opt-in given: @writes tests are included (the global setup still has to verify the stack)", async () => {
    expect((await config({ E2E_ALLOW_WRITES: "1" })).grepInvert).toBeUndefined();
  });

  it("browser runs are CI-only: without GITHUB_ACTIONS=true and the CI profile, nothing runs (accident prevention)", async () => {
    await expect(checkE2eTarget({ E2E_ALLOW_WRITES: "1" }, ciProbe)).rejects.toThrow(/local browser runs are disabled/);
    await expect(checkE2eTarget({}, ciProbe)).rejects.toThrow(/local browser runs are disabled/);
    await expect(checkE2eTarget(VALID, ciProbe)).rejects.toThrow(/local browser runs are disabled/);
    await expect(checkE2eTarget({ ...CI_RUN, GYM_ARENA_TEST_STACK: "gym-arena-fresh" }, ciProbe)).rejects.toThrow(/local browser runs are disabled/);
  });
  it("the CI flag authorizes nothing by itself: the target must still be the verified CI stack", async () => {
    await expect(checkE2eTarget({ ...CI_RUN, E2E_ALLOW_WRITES: "1" }, noStack)).rejects.toThrow(/cannot verify container/);
    await expect(checkE2eTarget({ ...CI_RUN, GYM_ARENA_CI_DISPOSABLE: undefined }, ciProbe)).rejects.toThrow(/explicit opt-in/);
  });
  it("the protected gym-arena-test stack is refused even with the CI flag set", async () => {
    const protectedEnv = {
      GITHUB_ACTIONS: "true",
      GYM_ARENA_TEST_STACK: "gym-arena-test",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321",
      TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:56322/postgres",
    };
    await expect(checkE2eTarget(protectedEnv, ciProbe)).rejects.toThrow(/local browser runs are disabled/);
    await expect(checkE2eTarget({ ...CI_RUN, NEXT_PUBLIC_SUPABASE_URL: protectedEnv.NEXT_PUBLIC_SUPABASE_URL }, ciProbe)).rejects.toThrow(/API port 56321/);
  });
  it("a verified CI stack in CI permits the run", async () => {
    await expect(checkE2eTarget({ ...CI_RUN, E2E_ALLOW_WRITES: "1" }, ciProbe)).resolves.toMatchObject({ project: "gym-arena-ci" });
  });
  it("remote mode (E2E_BASE_URL) is disabled, with or without the write opt-in", async () => {
    await expect(checkE2eTarget({ ...CI_RUN, E2E_BASE_URL: "https://example.test" }, ciProbe)).rejects.toThrow(/remote mode \(E2E_BASE_URL\) is disabled/);
    await expect(checkE2eTarget({ E2E_BASE_URL: "https://example.test", E2E_ALLOW_WRITES: "1" }, noStack)).rejects.toThrow(/remote mode/);
  });
  it("the full run check refuses before attesting when the target is wrong, and without a baseURL", async () => {
    await expect(checkE2eRun(VALID, ROOT, "http://localhost:3000", { probe: ciProbe })).rejects.toThrow(/local browser runs are disabled/);
    await expect(checkE2eRun(CI_RUN, ROOT, undefined, { probe: ciProbe })).rejects.toThrow(/no baseURL/);
  });
});

describe("Playwright: the guarded fixture", () => {
  it("every spec's test object carries the worker-scoped automatic guard", () => {
    const src = readFileSync(join(ROOT, "e2e", "fixtures.ts"), "utf8");
    expect(src).toMatch(/e2eWriteGuard/);
    expect(src).toMatch(/scope:\s*"worker",\s*auto:\s*true/);
    expect(src).toMatch(/checkE2eRun\(process\.env/);
  });
});

describe("Vitest DB suite: central guard", () => {
  it("the DB config runs the global identity check and the per-worker guard", async () => {
    const c = (await import("../../vitest.db.config.mjs")).default as { test: { globalSetup: string[]; setupFiles: string[]; include: string[] } };
    expect(c.test.globalSetup).toEqual(["tests/db/global-setup.ts"]);
    expect(c.test.setupFiles).toEqual(["tests/db/setup-guard.ts"]);
    expect(c.test.include).toEqual(["tests/db/**/*.test.ts"]);
  });
  it("the per-worker guard refuses a missing opt-in or an unverifiable target, and accepts a valid one", async () => {
    process.env.TEST_DB_ISOLATED = "";
    Object.assign(process.env, VALID);
    await expect(import("../db/setup-guard")).rejects.toThrow(/TEST_DB_ISOLATED=1/);
    vi.resetModules();
    process.env.TEST_DB_ISOLATED = "1";
    delete process.env.GYM_ARENA_TEST_STACK;
    await expect(import("../db/setup-guard")).rejects.toThrow(/GYM_ARENA_TEST_STACK is not set/);
    vi.resetModules();
    process.env.GYM_ARENA_TEST_STACK = "gym-arena-ci";
    await expect(import("../db/setup-guard")).resolves.toBeDefined();
  });
  it("the DB global setup refuses without TEST_DB_ISOLATED before touching anything", async () => {
    process.env.TEST_DB_ISOLATED = "0";
    const setup = (await import("../db/global-setup")).default;
    await expect(setup()).rejects.toThrow(/TEST_DB_ISOLATED=1/);
  });
});

describe("Vitest real-server cookie test: central guard", () => {
  it("the integration config runs the global guard before anything loads", async () => {
    const c = (await import("../../vitest.integration.config.mjs")).default as { test: { globalSetup: string[]; include: string[] } };
    expect(c.test.globalSetup).toEqual(["tests/integration/global-setup.ts"]);
    expect(c.test.include).toEqual(["tests/integration/**/*.test.ts"]);
  });
  it("it is CI-only and needs the verified CI stack, like the browser suite", async () => {
    const { checkCookieRun } = await import("../integration/global-setup");
    await expect(checkCookieRun(VALID, ROOT, ciProbe)).rejects.toThrow(/runs only in CI/);
    await expect(checkCookieRun({}, ROOT, ciProbe)).rejects.toThrow(/runs only in CI/);
    await expect(checkCookieRun({ ...CI_RUN, GYM_ARENA_TEST_STACK: "gym-arena-fresh" }, ROOT, ciProbe)).rejects.toThrow(/runs only in CI/);
    await expect(checkCookieRun(CI_RUN, ROOT, noStack)).rejects.toThrow(/cannot verify container/);
    await expect(checkCookieRun({ ...CI_RUN, GYM_ARENA_CI_DISPOSABLE: undefined }, ROOT, ciProbe)).rejects.toThrow(/explicit opt-in/);
  });
});

describe("no test can bypass the central guard", () => {
  const files = [
    ...readdirSync(join(ROOT, "e2e")).filter((f) => f.endsWith(".ts") && f !== "global-setup.ts").map((f) => join("e2e", f)),
    ...readdirSync(join(ROOT, "tests", "db")).filter((f) => f.endsWith(".ts") && !["global-setup.ts", "setup-guard.ts"].includes(f)).map((f) => join("tests", "db", f)),
    ...readdirSync(join(ROOT, "tests", "integration")).filter((f) => f.endsWith(".ts") && f !== "global-setup.ts").map((f) => join("tests", "integration", f)),
  ];
  it("there are test files to check", () => expect(files.length).toBeGreaterThan(15));
  it.each(files)("%s does not change the guard's inputs or the runner's selection", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    // no test may set, delete or override the variables the guard reads
    expect(src).not.toMatch(/process\.env(\.[A-Z_]+|\[[^\]]+\])\s*=(?!=)/);
    expect(src).not.toMatch(/delete\s+process\.env/);
    expect(src).not.toMatch(/Object\.assign\(\s*process\.env/);
    // no test may re-select tests, skip the global setup or point at another config
    expect(src).not.toMatch(/\bgrepInvert\b|\bglobalSetup\b|setupFiles/);
  });
  it("every @writes describe is also gated per test (defence in depth)", () => {
    for (const f of readdirSync(join(ROOT, "e2e")).filter((n) => n.endsWith(".spec.ts"))) {
      const src = readFileSync(join(ROOT, "e2e", f), "utf8");
      if (src.includes("@writes")) expect(src, f).toMatch(/requireWriteTarget\(\)/);
    }
  });
});
