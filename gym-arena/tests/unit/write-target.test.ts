import { describe, expect, it } from "vitest";
import { PROTECTED_STACKS, STACK_PROFILES, WriteTargetError, resolveWriteTarget } from "../support/write-target";

// The declared-profile half of the write gate (tests/support/write-target.ts). It must FAIL
// CLOSED: every case that is not positively a known disposable test stack is refused. The
// other half — proving the actual stack — is tested in stack-identity.test.ts.

/** The protected long-lived local test stack: never a write target. */
const PROTECTED = {
  GYM_ARENA_TEST_STACK: "gym-arena-test",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321",
  TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:56322/postgres",
};
const PROTECTED_URLS = { NEXT_PUBLIC_SUPABASE_URL: PROTECTED.NEXT_PUBLIC_SUPABASE_URL, TEST_DATABASE_URL: PROTECTED.TEST_DATABASE_URL };
const FRESH = {
  GYM_ARENA_TEST_STACK: "gym-arena-fresh",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:57321",
  TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
};
const CI = {
  GYM_ARENA_TEST_STACK: "gym-arena-ci",
  GYM_ARENA_CI_DISPOSABLE: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58321",
  TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres",
};
/** The developer's ordinary local stack — never a write target under any profile. */
const DEV_URLS = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" };

const refused = (env: Record<string, string | undefined>, reason: RegExp) => {
  expect(() => resolveWriteTarget(env)).toThrow(WriteTargetError);
  expect(() => resolveWriteTarget(env)).toThrow(reason);
};

describe("write target: declared profiles", () => {
  it("the fresh stack and the CI stack are recognised", () => {
    expect(resolveWriteTarget(FRESH).profile).toBe("gym-arena-fresh");
    expect(resolveWriteTarget({ ...FRESH, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:57321" }).profile).toBe("gym-arena-fresh");
    expect(resolveWriteTarget(CI).profile).toBe("gym-arena-ci");
  });
  it("every profile has its own ports; none uses the development (5432x) or protected (5632x) ports", () => {
    const ports = Object.values(STACK_PROFILES).flatMap((p) => [p.apiPort, p.dbPort]);
    expect(new Set(ports).size).toBe(ports.length);
    for (const p of ["54321", "54322", "56321", "56322"]) expect(ports).not.toContain(p);
  });
  it("profile names are the Supabase project ids; neither the development nor the protected project is one", () => {
    expect(Object.keys(STACK_PROFILES).sort()).toEqual(["gym-arena-ci", "gym-arena-fresh"]);
    expect(PROTECTED_STACKS).toEqual(["gym-arena-test"]);
    refused({ ...DEV_URLS, GYM_ARENA_TEST_STACK: "gym-arena" }, /unknown stack profile "gym-arena"/);
  });
});

describe("write target: the protected stack gym-arena-test is never a write target", () => {
  it("its name is refused, with its own URLs or any other profile's URLs", () => {
    refused(PROTECTED, /"gym-arena-test" is a protected stack/);
    refused({ ...FRESH, GYM_ARENA_TEST_STACK: "gym-arena-test" }, /protected stack/);
    refused({ ...CI, GYM_ARENA_TEST_STACK: "gym-arena-test" }, /protected stack/);
  });
  it("stale write opt-ins change nothing", () => {
    refused({ ...PROTECTED, TEST_DB_ISOLATED: "1", E2E_ALLOW_WRITES: "1", CI: "true", GITHUB_ACTIONS: "true" }, /protected stack/);
    refused({ ...PROTECTED, GYM_ARENA_CI_DISPOSABLE: "1" }, /protected stack/);
  });
  it("its URLs under any other profile are refused by port (API or database)", () => {
    refused({ ...FRESH, ...PROTECTED_URLS }, /API port 56321 is not 57321/);
    refused({ ...CI, ...PROTECTED_URLS }, /API port 56321 is not 58321/);
    refused({ ...FRESH, TEST_DATABASE_URL: PROTECTED.TEST_DATABASE_URL }, /database port 56322 is not 57322/);
    refused({ ...CI, TEST_DATABASE_URL: PROTECTED.TEST_DATABASE_URL }, /database port 56322 is not 58322/);
    refused({ ...FRESH, TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost:56322/postgres" }, /database port 56322/);
  });
  it("loopback aliases are not accepted as hosts", () => {
    refused({ ...FRESH, TEST_DATABASE_URL: "postgresql://postgres:postgres@[::1]:57322/postgres" }, /non-local host/);
    refused({ ...FRESH, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.2:57321" }, /non-local host/);
  });
});

describe("write target: everything else is refused", () => {
  it("generic CI flags authorize nothing: CI=true / GITHUB_ACTIONS=true never replace a profile", () => {
    refused({ ...DEV_URLS, CI: "true", GITHUB_ACTIONS: "true" }, /GYM_ARENA_TEST_STACK is not set/);
    refused({ ...DEV_URLS, CI: "true", GITHUB_ACTIONS: "true", GYM_ARENA_CI_DISPOSABLE: "1" }, /GYM_ARENA_TEST_STACK is not set/);
  });
  it("the development stack cannot impersonate CI (its ports are not the CI stack's)", () => {
    refused({ ...CI, ...DEV_URLS, CI: "true", GITHUB_ACTIONS: "true" }, /API port 54321 is not 58321/);
  });
  it("the CI profile needs its explicit opt-in, and a local profile must not carry it", () => {
    refused({ ...CI, GYM_ARENA_CI_DISPOSABLE: undefined }, /requires the explicit opt-in GYM_ARENA_CI_DISPOSABLE=1/);
    refused({ ...CI, GYM_ARENA_CI_DISPOSABLE: "true" }, /requires the explicit opt-in/);
    refused({ ...FRESH, GYM_ARENA_CI_DISPOSABLE: "1" }, /GYM_ARENA_CI_DISPOSABLE is set but the profile is the local "gym-arena-fresh"/);
    refused({ ...FRESH, GYM_ARENA_CI_DISPOSABLE: "0" }, /profile is the local/);
  });
  it("an unexpected port fails (API or database)", () => {
    refused({ ...FRESH, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55555" }, /API port 55555 is not 57321/);
    refused({ ...FRESH, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1" }, /API port \(default\) is not 57321/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:57321" }, /API port 57321 is not 58321/);
    refused({ ...FRESH, TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres" }, /database port 58322 is not 57322/);
    refused({ ...FRESH, TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1/postgres" }, /database port \(default\)/);
  });
  it("an unknown or missing project identity fails", () => {
    refused({ ...FRESH, GYM_ARENA_TEST_STACK: "ci-disposable" }, /unknown stack profile "ci-disposable"/);
    refused({ ...FRESH, GYM_ARENA_TEST_STACK: "toString" }, /unknown stack profile/);
    refused({ ...FRESH, GYM_ARENA_TEST_STACK: undefined }, /GYM_ARENA_TEST_STACK is not set/);
  });
  it("cloud or remote URLs fail", () => {
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" }, /uses https:/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "http://abcd.supabase.co:58321" }, /non-local host \(abcd\.supabase\.co\)/);
    refused({ ...CI, TEST_DATABASE_URL: "postgresql://postgres:x@db.abcd.supabase.co:58322/postgres" }, /non-local host/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "http://10.0.0.5:58321" }, /non-local host/);
  });
  it("no fallback silently authorizes a write: missing or malformed settings are refused", () => {
    refused({}, /GYM_ARENA_TEST_STACK is not set/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: undefined }, /NEXT_PUBLIC_SUPABASE_URL is not set/);
    refused({ ...CI, TEST_DATABASE_URL: undefined }, /TEST_DATABASE_URL is not set/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "" }, /is not set/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "not a url" }, /is not a valid URL/);
    refused({ ...CI, TEST_DATABASE_URL: "http://127.0.0.1:58322" }, /uses http:/);
  });
});
