/**
 * Central write guard for the browser suite (playwright.config.ts `globalSetup`): runs once,
 * before any test of any project. The same checks run again, independently of the runner
 * configuration, in the worker fixture every spec must use (e2e/fixtures.ts).
 *
 * Every browser run writes: it signs in with seed accounts and stores their language
 * (POST /api/locale, PATCH /api/me); tests tagged @writes create permanent rows. So:
 *
 *  1. Remote mode (E2E_BASE_URL) is DISABLED — a browser is never pointed at an arbitrary URL.
 *  2. Browser runs are CI-only: profile gym-arena-ci and GITHUB_ACTIONS=true.
 *     GITHUB_ACTIONS=true is ACCIDENT PREVENTION, NOT AUTHENTICATION: anyone can set it. It
 *     keeps an ordinary local `npm run test:e2e` from writing. It does not prove a GitHub
 *     runner, and the protection of the protected stack does not depend on it (step 3).
 *  3. The target stack is verified from the actual running resources
 *     (tests/support/stack-identity.ts); the protected gym-arena-test stack is refused by name,
 *     port and container identity, whatever the environment says.
 *  4. The build the app server uses is attested: the Supabase address compiled into it is the
 *     verified one, and the RUNNING server serves exactly that build
 *     (tests/support/build-attestation.ts). Playwright starts the web server BEFORE global
 *     setup, so the server is already up here and is checked directly.
 */
import type { FullConfig } from "@playwright/test";
import { resolve } from "node:path";
import { attestBuild, verifyServedBuild, type BuildAttestation, type Fetcher } from "../tests/support/build-attestation";
import { verifyWriteTarget, type IdentityProbe, type VerifiedTarget } from "../tests/support/stack-identity";

type Env = Readonly<Record<string, string | undefined>>;

const CI_ONLY =
  "local browser runs are disabled — browser tests write, so they run only in CI on the job's own " +
  "disposable gym-arena-ci stack (GITHUB_ACTIONS=true is accident prevention, not authentication)";

/** Steps 1–3: mode, CI-only policy, verified target. */
export async function checkE2eTarget(env: Env, probe?: IdentityProbe): Promise<VerifiedTarget> {
  if (env.E2E_BASE_URL) throw new Error("Refusing to run browser tests: remote mode (E2E_BASE_URL) is disabled");
  if (env.GITHUB_ACTIONS !== "true" || env.GYM_ARENA_TEST_STACK !== "gym-arena-ci") {
    throw new Error(`Refusing to run browser tests: ${CI_ONLY}`);
  }
  const target = await verifyWriteTarget(env, probe);
  if (target.project !== "gym-arena-ci") throw new Error(`Refusing to run browser tests: ${CI_ONLY}`);
  return target;
}

export interface E2eRunDeps {
  probe?: IdentityProbe;
  fetcher?: Fetcher;
}

/** Steps 1–4. Throws before any test can run if anything cannot be established. */
export async function checkE2eRun(
  env: Env,
  appDir: string,
  baseURL: string | undefined,
  deps: E2eRunDeps = {},
): Promise<{ target: VerifiedTarget; build: BuildAttestation }> {
  const target = await checkE2eTarget(env, deps.probe);
  if (!baseURL) throw new Error("Refusing to run browser tests: no baseURL is configured");
  const build = attestBuild(appDir, env, target.apiUrl);
  await verifyServedBuild(baseURL, build, deps.fetcher);
  return { target, build };
}

/** The app directory (where next.config.ts lives): this file is in <app>/e2e. */
export const appDirectory = () => resolve(__dirname, "..");

export default async function globalSetup(config: FullConfig): Promise<void> {
  const { target, build } = await checkE2eRun(process.env, appDirectory(), config.projects[0]?.use.baseURL);
  console.info(
    `[write-guard] browser suite → verified ${target.project}; build ${build.buildId} targets ${build.origin} and is the build being served; ` +
      `@writes ${process.env.E2E_ALLOW_WRITES === "1" ? "enabled" : "excluded"}`,
  );
}
