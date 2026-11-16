/**
 * Central write guard for the browser suite (playwright.config.ts `globalSetup`): runs once,
 * before any test of any project.
 *
 * Against a local app (no E2E_BASE_URL) every run signs in with seed accounts and stores their
 * language preference (POST /api/locale, PATCH /api/me) — so EVERY local run writes, and is
 * allowed only on a verified test stack (tests/support/stack-identity.ts). Tests tagged
 * @writes, which create permanent rows, additionally need the opt-in E2E_ALLOW_WRITES=1
 * (without it playwright.config.ts excludes them).
 *
 * Remote mode (E2E_BASE_URL set: seed tests skip themselves, nothing signs in) never writes:
 * the @writes opt-in is refused there.
 */
import { verifyWriteTarget, type IdentityProbe, type VerifiedTarget } from "../tests/support/stack-identity";

export async function checkE2eTarget(env: Readonly<Record<string, string | undefined>>, probe?: IdentityProbe): Promise<VerifiedTarget | "remote-read-only"> {
  if (env.E2E_BASE_URL) {
    if (env.E2E_ALLOW_WRITES === "1") throw new Error("Refusing to write: E2E_ALLOW_WRITES is not allowed against a remote E2E_BASE_URL");
    return "remote-read-only";
  }
  return verifyWriteTarget(env, probe);
}

export default async function globalSetup(): Promise<void> {
  const t = await checkE2eTarget(process.env);
  if (t === "remote-read-only") console.info("[write-guard] browser suite → remote read-only mode (no writes)");
  else console.info(`[write-guard] browser suite → verified ${t.project}; @writes ${process.env.E2E_ALLOW_WRITES === "1" ? "enabled" : "excluded"}`);
}
