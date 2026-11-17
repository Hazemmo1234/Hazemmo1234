/**
 * The ONLY gate that authorizes a test to write to a database (DB suite and browser @writes).
 *
 * Tests that write create rows that can never be deleted (BR-E8), so they may run only against
 * a stack positively identified as a disposable test stack. The decision is made from an
 * explicit profile, never inferred from a port or a generic flag, and it FAILS CLOSED: anything
 * missing, unknown, protected, contradictory or non-local is refused with a reason.
 *
 * Profiles — each one a named LOCAL Supabase stack whose name is its Supabase project id and
 * whose ports are its own:
 *  - gym-arena-fresh  fresh disposable local stack                                     API 57321, DB 57322
 *  - gym-arena-ci     the disposable stack a CI job creates (scripts/disposable-stack.sh) API 58321, DB 58322
 *
 * PROTECTED stacks are never a write target under any settings. The long-lived local test stack
 * gym-arena-test (API 56321, DB 56322) holds data that must survive: it has no profile, and its
 * name is refused explicitly. The development stack (project "gym-arena", 54321/54322) has no
 * profile either. Changing one port never helps: both URLs must match the profile exactly.
 *
 * gym-arena-ci additionally requires the explicit opt-in GYM_ARENA_CI_DISPOSABLE=1 (set by the CI
 * workflow on its test steps); a local profile must not carry it. Generic flags (CI,
 * GITHUB_ACTIONS) authorize nothing here.
 *
 * This module is the synchronous, in-process half (declared profile + URLs). The other half,
 * stack-identity.ts, proves from the actual running containers, volume and database that the
 * stack really is that profile's stack; it runs before any test can write.
 */

export const STACK_PROFILES = {
  "gym-arena-fresh": { apiPort: "57321", dbPort: "57322", ci: false },
  "gym-arena-ci": { apiPort: "58321", dbPort: "58322", ci: true },
} as const;

/** Stacks whose data must survive: never a write target, whatever the environment says. */
export const PROTECTED_STACKS = ["gym-arena-test"] as const;

export type StackProfile = keyof typeof STACK_PROFILES;

export interface WriteTarget {
  profile: StackProfile;
  apiUrl: string;
  dbUrl: string;
}

export class WriteTargetError extends Error {
  constructor(reason: string) {
    super(`Refusing to write: ${reason}`);
    this.name = "WriteTargetError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function parse(name: string, value: string | undefined, protocols: readonly string[]): URL {
  if (!value) throw new WriteTargetError(`${name} is not set`);
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new WriteTargetError(`${name} is not a valid URL`);
  }
  if (!protocols.includes(u.protocol)) throw new WriteTargetError(`${name} uses ${u.protocol}, expected ${protocols.join(" or ")}`);
  if (!LOCAL_HOSTS.has(u.hostname)) throw new WriteTargetError(`${name} points at a non-local host (${u.hostname})`);
  return u;
}

/** Decides whether this process may write to the database it is configured for. Throws if not. */
export function resolveWriteTarget(env: Env): WriteTarget {
  const name = env.GYM_ARENA_TEST_STACK;
  if (!name) throw new WriteTargetError("GYM_ARENA_TEST_STACK is not set (no stack profile chosen)");
  if ((PROTECTED_STACKS as readonly string[]).includes(name)) {
    throw new WriteTargetError(`"${name}" is a protected stack — no test may write to it`);
  }
  if (!Object.prototype.hasOwnProperty.call(STACK_PROFILES, name)) {
    throw new WriteTargetError(`unknown stack profile "${name}"`);
  }
  const profile = name as StackProfile;
  const expected = STACK_PROFILES[profile];

  const api = parse("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL, ["http:"]);
  const db = parse("TEST_DATABASE_URL", env.TEST_DATABASE_URL, ["postgres:", "postgresql:"]);
  if (api.port !== expected.apiPort) throw new WriteTargetError(`API port ${api.port || "(default)"} is not ${expected.apiPort} for ${profile}`);
  if (db.port !== expected.dbPort) throw new WriteTargetError(`database port ${db.port || "(default)"} is not ${expected.dbPort} for ${profile}`);

  const ciFlag = env.GYM_ARENA_CI_DISPOSABLE;
  if (expected.ci) {
    if (ciFlag !== "1") throw new WriteTargetError(`${profile} requires the explicit opt-in GYM_ARENA_CI_DISPOSABLE=1`);
  } else if (ciFlag !== undefined) {
    // a local profile must not carry the CI authorization: the configuration is ambiguous
    throw new WriteTargetError(`GYM_ARENA_CI_DISPOSABLE is set but the profile is the local "${profile}"`);
  }
  return { profile, apiUrl: api.href, dbUrl: db.href };
}
