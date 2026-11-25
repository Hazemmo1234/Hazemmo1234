/**
 * Central write guard for the DB suite (vitest.db.config.mts `globalSetup`): runs ONCE, before
 * any test file is loaded. The suite writes permanent rows (BR-E8), so it refuses to start
 * unless the stack is explicitly marked disposable (TEST_DB_ISOLATED=1) AND the actual running
 * stack is verified to be the declared test stack (tests/support/stack-identity.ts).
 */
import { verifyWriteTarget } from "../support/stack-identity";

export default async function verifyDbWriteTarget(): Promise<void> {
  if (process.env.TEST_DB_ISOLATED !== "1") {
    throw new Error("Database tests refuse to run without TEST_DB_ISOLATED=1. They create permanent rows.");
  }
  const t = await verifyWriteTarget(process.env);
  console.info(`[write-guard] DB suite → verified ${t.project} (db ${t.dbContainer}, volume ${t.volume}, API port ${new URL(t.apiUrl).port})`);
}
