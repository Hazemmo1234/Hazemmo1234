import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MINIMUM_MAJOR, nodeVersionProblem } from "../../scripts/check-node.mjs";

// The operator commands (npm run staging:* / prod:*) refuse an unsupported Node.js with a clear
// message before anything runs (scripts/check-node.mjs). Minimum 22: the Supabase client they use
// declares Node.js >= 22, and util.parseEnv / --env-file need 20.12 / 20.6.

const ROOT = join(__dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { engines: { node: string }; scripts: Record<string, string> };
const GUARD = "node scripts/check-node.mjs && ";

/** Runs the guard as the npm scripts do, optionally pretending to be another Node.js version. */
function runGuard(pretend?: string) {
  const args = pretend ? [`--import=data:text/javascript,Object.defineProperty(process.versions,'node',{value:'${pretend}'})`] : [];
  return spawnSync(process.execPath, [...args, "scripts/check-node.mjs"], { cwd: ROOT, encoding: "utf8" });
}

describe("Node.js version guard for the operator commands", () => {
  it("accepts Node.js 22 and newer, including the Node.js running these tests", () => {
    expect(MINIMUM_MAJOR).toBe(22);
    for (const v of ["22.0.0", "22.12.0", "v22.23.4", "24.1.0", "26.0.0"]) expect(nodeVersionProblem(v), v).toBeNull();
    expect(nodeVersionProblem(process.versions.node)).toBeNull();
  });

  it("refuses older versions with a clear message", () => {
    for (const v of ["20.11.1", "20.12.0", "20.19.5", "21.7.3", "18.20.4", "v16.0.0"]) {
      const message = nodeVersionProblem(v);
      expect(message, v).not.toBeNull();
      expect(message).toContain(`Node.js v${v.replace(/^v/, "")} is not supported`);
      expect(message).toContain("need Node.js 22 or newer");
      expect(message).toContain("Install the current Node.js 22 LTS");
      expect(message).toContain("Nothing was read or changed.");
    }
    expect(nodeVersionProblem("not-a-version")).toContain('Node.js "not-a-version" is not supported');
  });

  it("runs first in every staging and production command", () => {
    const ops = Object.entries(pkg.scripts).filter(([name]) => /^(staging|prod):/.test(name));
    expect(ops.map(([name]) => name).sort()).toEqual(
      ["backup", "create-admin", "migrate", "preflight", "psql", "verify"].flatMap((c) => [`prod:${c}`, `staging:${c}`]).sort(),
    );
    for (const [name, command] of ops) expect(command.startsWith(GUARD), name).toBe(true);
  });

  it("declares the same minimum in package.json engines", () => {
    expect(pkg.engines.node).toBe(`>=${MINIMUM_MAJOR}`);
  });

  it("exits 0 without output on a supported Node.js", () => {
    const r = runGuard();
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe("");
  });

  it("prints the message and exits 1 on an unsupported Node.js", () => {
    for (const old of ["20.11.1", "20.19.5"]) {
      const r = runGuard(old);
      expect(r.status, old).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain(`Node.js v${old} is not supported by the Gym Arena operator commands: they need Node.js 22 or newer.`);
    }
  });
});
