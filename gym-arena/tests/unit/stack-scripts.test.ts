import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The stack scripts must refuse every route to a reset or a local disposable-stack lifecycle
// BEFORE touching Docker or the Supabase CLI. The scripts run from a COPY in a temporary app
// directory (no supabase/ folder, no node_modules/.bin/supabase) with a FAKE `docker` first on
// PATH that never calls the real one: it only records that it was called, then fails. The
// environment is built from scratch (nothing inherited), DOCKER_HOST points nowhere.

const APP = join(__dirname, "..", "..");
let tmp: string;
let log: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "gym-arena-scripts-"));
  mkdirSync(join(tmp, "scripts"));
  mkdirSync(join(tmp, "bin"));
  for (const s of ["test-stack.sh", "disposable-stack.sh"]) copyFileSync(join(APP, "scripts", s), join(tmp, "scripts", s));
  log = join(tmp, "docker-calls.log");
  writeFileSync(join(tmp, "bin", "docker"), '#!/bin/sh\necho "$@" >> "$FAKE_DOCKER_LOG"\nexit 1\n');
  chmodSync(join(tmp, "bin", "docker"), 0o755);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function run(script: string, args: string[], extraEnv: Record<string, string> = {}) {
  rmSync(log, { force: true });
  const r = spawnSync("bash", [join(tmp, "scripts", script), ...args], {
    cwd: tmp,
    encoding: "utf8",
    timeout: 20_000,
    // NODE_ENV: required by the ProcessEnv type (next/types/global.d.ts); the scripts never read it
    env: { NODE_ENV: "test", PATH: `${join(tmp, "bin")}:/usr/bin:/bin`, HOME: tmp, FAKE_DOCKER_LOG: log, DOCKER_HOST: "unix:///nonexistent", ...extraEnv },
  });
  return { status: r.status, stderr: r.stderr, dockerCalled: existsSync(log) };
}

describe("scripts/test-stack.sh — the protected gym-arena-test stack cannot be reset", () => {
  it.each([["reset"], ["db-reset"], [""], ["seed"]])("'%s' is refused before Docker or the CLI is touched", (cmd) => {
    const r = run("test-stack.sh", cmd ? [cmd] : []);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/there is no reset: gym-arena-test is protected/);
    expect(r.dockerCalled).toBe(false);
  });
  it("the script contains no reset path and its env output arms no test write", () => {
    const src = readFileSync(join(APP, "scripts", "test-stack.sh"), "utf8");
    expect(src).not.toMatch(/db reset|reset\)/);
    expect(src).not.toMatch(/^TEST_DB_ISOLATED=|^E2E_ALLOW_WRITES=/m);
  });
});

describe("scripts/disposable-stack.sh — no local disposable-stack lifecycle", () => {
  it.each(["start", "reuse", "verify", "env", "stop", "destroy"])("gym-arena-fresh %s is refused, even with GITHUB_ACTIONS=true", (cmd) => {
    const envs: Record<string, string>[] = [{}, { GITHUB_ACTIONS: "true" }];
    for (const env of envs) {
      const r = run("disposable-stack.sh", ["gym-arena-fresh", cmd], env);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/gym-arena-fresh is disabled/);
      expect(r.dockerCalled).toBe(false);
    }
  });
  it.each(["start", "destroy", "env-github", "reuse"])("gym-arena-ci %s outside CI (no GITHUB_ACTIONS=true) is refused", (cmd) => {
    const envs: Record<string, string>[] = [{}, { GITHUB_ACTIONS: "false" }, { GITHUB_ACTIONS: "1" }, { CI: "true" }];
    for (const env of envs) {
      const r = run("disposable-stack.sh", ["gym-arena-ci", cmd], env);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/managed only inside CI/);
      expect(r.dockerCalled).toBe(false);
    }
  });
  it.each([["gym-arena-test", "destroy"], ["gym-arena", "destroy"], ["", ""], ["GYM-ARENA-CI", "start"], ["gym-arena-ci;rm", "destroy"]])(
    "project '%s' is refused (usage), even with GITHUB_ACTIONS=true",
    (project, cmd) => {
      const r = run("disposable-stack.sh", [project, cmd].filter(Boolean), { GITHUB_ACTIONS: "true" });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/usage: scripts\/disposable-stack\.sh gym-arena-ci/);
      expect(r.dockerCalled).toBe(false);
    },
  );
  it("inside CI the gate opens for gym-arena-ci only — an unknown command or a missing config still fails before Docker", () => {
    const unknown = run("disposable-stack.sh", ["gym-arena-ci", "nuke"], { GITHUB_ACTIONS: "true" });
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toMatch(/unknown command 'nuke'/);
    expect(unknown.dockerCalled).toBe(false);
    const verify = run("disposable-stack.sh", ["gym-arena-ci", "verify"], { GITHUB_ACTIONS: "true" });
    expect(verify.status).toBe(1);
    expect(verify.stderr).toMatch(/missing .*\.ci-stack\/supabase\/config\.toml/);
    expect(verify.dockerCalled).toBe(false);
  });
});

describe("package.json — no npm script resets the protected stack", () => {
  const scripts = (JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  it("test:db:isolated and test:e2e:isolated only explain and exit 1", () => {
    for (const name of ["test:db:isolated", "test:e2e:isolated"]) {
      expect(scripts[name]).toMatch(/process\.exit\(1\)/);
      expect(scripts[name]).not.toMatch(/test-stack\.sh|disposable-stack\.sh|playwright|vitest|supabase|docker/);
    }
  });
  it("no script reaches a reset of the test stack, and the old isolated E2E script is gone", () => {
    for (const [name, cmd] of Object.entries(scripts)) {
      expect(cmd, name).not.toMatch(/test-stack\.sh\s+reset|e2e-isolated|disposable-stack\.sh/);
    }
    expect(existsSync(join(APP, "scripts", "e2e-isolated.sh"))).toBe(false);
  });
});
