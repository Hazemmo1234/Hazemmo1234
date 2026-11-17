/**
 * The ONLY `test` object browser specs may use (enforced by tests/unit/e2e-import-graph.test.ts).
 *
 * It adds a worker-scoped automatic fixture that runs the full browser-suite guard
 * (e2e/global-setup.ts checkE2eRun: remote mode refused, CI-only policy, verified target stack,
 * attested build that the running server is serving) before the first test of every worker —
 * so the guard runs even if a different Playwright configuration skipped the global setup.
 * Worker fixtures are set up before any test-scoped fixture (`page`, `context`, `request`) and
 * before any test body, so no navigation, sign-in or client call can happen first.
 *
 * GITHUB_ACTIONS=true is accident prevention, not authentication (see e2e/global-setup.ts).
 */
import { test as base, expect } from "@playwright/test";
import { appDirectory, checkE2eRun } from "./global-setup";

export { expect };

export const test = base.extend<Record<never, never>, { e2eWriteGuard: void }>({
  e2eWriteGuard: [
    async ({}, use, workerInfo) => {
      await checkE2eRun(process.env, appDirectory(), workerInfo.project.use.baseURL);
      await use();
    },
    { scope: "worker", auto: true },
  ],
});
