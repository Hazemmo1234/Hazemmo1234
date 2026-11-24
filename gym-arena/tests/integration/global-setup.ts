/**
 * Central guard for the real-server cookie test (vitest.integration.config.mts `globalSetup`):
 * runs once, before the test file is loaded.
 *
 * The test signs in with the seed admin and lets the app refresh that session, which writes Auth
 * sessions. So it follows the browser suite's rules (e2e/global-setup.ts):
 *  1. CI only: profile gym-arena-ci and GITHUB_ACTIONS=true (accident prevention, not
 *     authentication — it keeps an ordinary local run from writing);
 *  2. the target stack is verified from the actual running resources
 *     (tests/support/stack-identity.ts); the protected gym-arena-test stack is always refused;
 *  3. the production build the test starts is attested to target that verified stack
 *     (tests/support/build-attestation.ts). Each server the test starts is then checked to be
 *     serving exactly this build before any request is judged.
 */
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";
import { attestBuild, type BuildAttestation } from "../support/build-attestation";
import { verifyWriteTarget, type IdentityProbe, type VerifiedTarget } from "../support/stack-identity";

type Env = Readonly<Record<string, string | undefined>>;

const CI_ONLY =
  "the real-server cookie test signs in (it writes Auth sessions), so it runs only in CI on the job's own " +
  "disposable gym-arena-ci stack (GITHUB_ACTIONS=true is accident prevention, not authentication)";

export async function checkCookieRun(env: Env, appDir: string, probe?: IdentityProbe): Promise<{ target: VerifiedTarget; build: BuildAttestation }> {
  if (env.GITHUB_ACTIONS !== "true" || env.GYM_ARENA_TEST_STACK !== "gym-arena-ci") throw new Error(`Refusing to run: ${CI_ONLY}`);
  const target = await verifyWriteTarget(env, probe);
  if (target.project !== "gym-arena-ci") throw new Error(`Refusing to run: ${CI_ONLY}`);
  const build = attestBuild(appDir, env, target.apiUrl);
  return { target, build };
}

declare module "vitest" {
  export interface ProvidedContext {
    cookieTestApiUrl: string;
  }
}

export default async function setup(project: TestProject): Promise<void> {
  const { target, build } = await checkCookieRun(process.env, resolve(__dirname, "..", ".."));
  project.provide("cookieTestApiUrl", target.apiUrl);
  console.info(`[write-guard] real-server cookie test → verified ${target.project}; build ${build.buildId} targets ${build.origin}`);
}
