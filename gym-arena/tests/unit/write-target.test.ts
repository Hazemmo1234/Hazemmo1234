import { describe, expect, it } from "vitest";
import { STACK_PROFILES, WriteTargetError, resolveWriteTarget } from "../support/write-target";

// The declared-profile half of the write gate (tests/support/write-target.ts). It must FAIL
// CLOSED: every case that is not positively a known test stack is refused. The other half —
// proving the actual stack — is tested in stack-identity.test.ts.

const LOCAL_TEST = {
  GYM_ARENA_TEST_STACK: "gym-arena-test",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321",
  TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:56322/postgres",
};
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
  it("the long-lived local test stack, the fresh stack and the CI stack are recognised", () => {
    expect(resolveWriteTarget(LOCAL_TEST).profile).toBe("gym-arena-test");
    expect(resolveWriteTarget(FRESH).profile).toBe("gym-arena-fresh");
    expect(resolveWriteTarget({ ...FRESH, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:57321" }).profile).toBe("gym-arena-fresh");
    expect(resolveWriteTarget(CI).profile).toBe("gym-arena-ci");
  });
  it("every profile has its own ports, and none uses the development stack's 54321/54322", () => {
    const ports = Object.values(STACK_PROFILES).flatMap((p) => [p.apiPort, p.dbPort]);
    expect(new Set(ports).size).toBe(ports.length);
    expect(ports).not.toContain("54321");
    expect(ports).not.toContain("54322");
  });
  it("profile names are the Supabase project ids, and the development project is not one of them", () => {
    expect(Object.keys(STACK_PROFILES).sort()).toEqual(["gym-arena-ci", "gym-arena-fresh", "gym-arena-test"]);
    refused({ ...LOCAL_TEST, ...DEV_URLS, GYM_ARENA_TEST_STACK: "gym-arena" }, /unknown stack profile "gym-arena"/);
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
  it("the protected gym-arena-test stack can never be reached under the CI profile", () => {
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: LOCAL_TEST.NEXT_PUBLIC_SUPABASE_URL, TEST_DATABASE_URL: LOCAL_TEST.TEST_DATABASE_URL }, /API port 56321 is not 58321/);
    refused({ ...CI, TEST_DATABASE_URL: LOCAL_TEST.TEST_DATABASE_URL }, /database port 56322 is not 58322/);
    refused({ ...LOCAL_TEST, GYM_ARENA_CI_DISPOSABLE: "1" }, /GYM_ARENA_CI_DISPOSABLE is set but the profile is the local "gym-arena-test"/);
  });
  it("the CI profile needs its explicit opt-in", () => {
    refused({ ...CI, GYM_ARENA_CI_DISPOSABLE: undefined }, /requires the explicit opt-in GYM_ARENA_CI_DISPOSABLE=1/);
    refused({ ...CI, GYM_ARENA_CI_DISPOSABLE: "true" }, /requires the explicit opt-in/);
  });
  it("an unexpected port fails (API or database)", () => {
    refused({ ...LOCAL_TEST, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55555" }, /API port 55555 is not 56321/);
    refused({ ...LOCAL_TEST, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1" }, /API port \(default\) is not 56321/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:57321" }, /API port 57321 is not 58321/);
    refused({ ...FRESH, TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres" }, /database port 58322 is not 57322/);
    refused({ ...LOCAL_TEST, TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1/postgres" }, /database port \(default\)/);
  });
  it("an unknown or missing project identity fails", () => {
    refused({ ...LOCAL_TEST, GYM_ARENA_TEST_STACK: "ci-disposable" }, /unknown stack profile "ci-disposable"/);
    refused({ ...LOCAL_TEST, GYM_ARENA_TEST_STACK: "toString" }, /unknown stack profile/);
    refused({ ...LOCAL_TEST, GYM_ARENA_TEST_STACK: undefined }, /GYM_ARENA_TEST_STACK is not set/);
  });
  it("cloud or remote URLs fail", () => {
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" }, /uses https:/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "http://abcd.supabase.co:58321" }, /non-local host \(abcd\.supabase\.co\)/);
    refused({ ...CI, TEST_DATABASE_URL: "postgresql://postgres:x@db.abcd.supabase.co:58322/postgres" }, /non-local host/);
    refused({ ...CI, NEXT_PUBLIC_SUPABASE_URL: "http://10.0.0.5:58321" }, /non-local host/);
  });
  it("ambiguous configuration fails", () => {
    refused({ ...FRESH, GYM_ARENA_CI_DISPOSABLE: "0" }, /profile is the local/);
    refused({ ...LOCAL_TEST, TEST_DATABASE_URL: FRESH.TEST_DATABASE_URL }, /database port 57322 is not 56322/);
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
