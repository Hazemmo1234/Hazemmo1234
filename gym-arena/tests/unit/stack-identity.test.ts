import { describe, expect, it } from "vitest";
import { LOCAL_JWT_SECRET, PROJECT_LABEL, verifyWriteTarget, type ContainerInfo, type IdentityProbe } from "../support/stack-identity";
import { WriteTargetError } from "../support/write-target";

// The resource half of the write gate (tests/support/stack-identity.ts): environment variables
// alone can never authorize a write — a stack with the declared identity must actually exist
// and must be the one the URLs reach. Each "world" below is a set of running stacks.

const CI_ENV = {
  GYM_ARENA_TEST_STACK: "gym-arena-ci",
  GYM_ARENA_CI_DISPOSABLE: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58321",
  TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres",
};
const FRESH_ENV = {
  GYM_ARENA_TEST_STACK: "gym-arena-fresh",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:57321",
  TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
};

interface Stack {
  project: string;
  apiPort: string;
  dbPort: string;
  systemId: string;
  db?: Partial<ContainerInfo>;
  api?: Partial<ContainerInfo>;
  jwtSecret?: string;
}
const stack = (project: string, apiPort: string, dbPort: string, systemId: string, extra: Partial<Stack> = {}): Stack => ({ project, apiPort, dbPort, systemId, ...extra });
const CI_STACK = stack("gym-arena-ci", "58321", "58322", "7400000000000000001");
const DEV_STACK = stack("gym-arena", "54321", "54322", "7400000000000000002");
const TEST_STACK = stack("gym-arena-test", "56321", "56322", "7400000000000000003");

/** A fake Docker host + Postgres: answers like the real probe would for these stacks. */
function world(stacks: Stack[], opts: { dockerDown?: boolean; urlSystemId?: string } = {}): IdentityProbe {
  const containers = new Map<string, { info: ContainerInfo; stack: Stack }>();
  for (const s of stacks) {
    const labels = { [PROJECT_LABEL]: s.project };
    containers.set(`supabase_db_${s.project}`, {
      stack: s,
      info: {
        name: `supabase_db_${s.project}`, running: true, image: "public.ecr.aws/supabase/postgres:17.11.0.018", labels,
        ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: s.dbPort }] },
        mounts: [{ Type: "volume", Name: `supabase_db_${s.project}`, Destination: "/var/lib/postgresql/data" }],
        ...s.db,
      },
    });
    containers.set(`supabase_kong_${s.project}`, {
      stack: s,
      info: {
        name: `supabase_kong_${s.project}`, running: true, image: "public.ecr.aws/supabase/kong:2.8.1", labels,
        ports: { "8000/tcp": [{ HostIp: "0.0.0.0", HostPort: s.apiPort }] }, mounts: [], ...s.api,
      },
    });
  }
  // which stack answers on a database port (one listener per host port)
  const byDbPort = (url: string) => stacks.find((s) => s.dbPort === new URL(url).port);
  return {
    async inspect(name) {
      if (opts.dockerDown) throw new Error("Cannot connect to the Docker daemon at unix:///var/run/docker.sock");
      const c = containers.get(name);
      if (!c) throw new Error(`Error: No such container: ${name}`);
      return c.info;
    },
    async containerSystemId(name) {
      if (opts.dockerDown) throw new Error("Cannot connect to the Docker daemon");
      return containers.get(name)!.stack.systemId;
    },
    async urlIdentity(url) {
      const s = byDbPort(url);
      if (!s) throw new Error("connect ECONNREFUSED");
      return { systemId: opts.urlSystemId ?? s.systemId, jwtSecret: s.jwtSecret ?? LOCAL_JWT_SECRET };
    },
  };
}

const refused = async (env: Record<string, string | undefined>, probe: IdentityProbe, reason: RegExp) => {
  const p = verifyWriteTarget(env, probe);
  await expect(p).rejects.toBeInstanceOf(WriteTargetError);
  await expect(verifyWriteTarget(env, probe)).rejects.toThrow(reason);
};

describe("stack identity: the real CI stack", () => {
  it("passes with the correct identity — containers, label, ports, volume, same database", async () => {
    const t = await verifyWriteTarget(CI_ENV, world([CI_STACK, DEV_STACK, TEST_STACK]));
    expect(t).toMatchObject({ project: "gym-arena-ci", dbContainer: "supabase_db_gym-arena-ci", apiContainer: "supabase_kong_gym-arena-ci", volume: "supabase_db_gym-arena-ci", systemId: CI_STACK.systemId });
  });
  it("the fresh local stack passes the same way", async () => {
    const fresh = stack("gym-arena-fresh", "57321", "57322", "7400000000000000004");
    expect((await verifyWriteTarget(FRESH_ENV, world([fresh]))).project).toBe("gym-arena-fresh");
  });
});

describe("stack identity: refusals (fail closed)", () => {
  it("wrong project id on the containers", async () => {
    const impostor = { ...CI_STACK, db: { labels: { [PROJECT_LABEL]: "gym-arena" } } };
    await refused(CI_ENV, world([impostor]), /belongs to project "gym-arena", not "gym-arena-ci"/);
    const unlabelled = { ...CI_STACK, api: { labels: {} } };
    await refused(CI_ENV, world([unlabelled]), /belongs to project "\(none\)"/);
  });
  it("wrong API port mapping", async () => {
    await refused(CI_ENV, world([{ ...CI_STACK, apiPort: "58999" }]), /does not publish the API on port 58321/);
  });
  it("wrong DB port mapping", async () => {
    await refused(CI_ENV, world([{ ...CI_STACK, dbPort: "58999" }]), /does not publish the database on port 58322/);
  });
  it("wrong volume (another stack's, or a bind mount, or none)", async () => {
    await refused(CI_ENV, world([{ ...CI_STACK, db: { mounts: [{ Type: "volume", Name: "supabase_db_gym-arena", Destination: "/var/lib/postgresql/data" }] } }]), /does not keep its data in the volume supabase_db_gym-arena-ci/);
    await refused(CI_ENV, world([{ ...CI_STACK, db: { mounts: [{ Type: "bind", Destination: "/var/lib/postgresql/data" }] } }]), /volume supabase_db_gym-arena-ci/);
    await refused(CI_ENV, world([{ ...CI_STACK, db: { mounts: [] } }]), /volume supabase_db_gym-arena-ci/);
  });
  it("wrong container: missing, stopped, renamed or the wrong image", async () => {
    await refused(CI_ENV, world([DEV_STACK]), /cannot verify container supabase_db_gym-arena-ci/);
    await refused(CI_ENV, world([{ ...CI_STACK, db: { running: false } }]), /is not running/);
    await refused(CI_ENV, world([{ ...CI_STACK, api: { name: "something-else" } }]), /expected names/);
    await refused(CI_ENV, world([{ ...CI_STACK, db: { image: "postgres:17" } }]), /unexpected image/);
    await refused(CI_ENV, world([{ ...CI_STACK, api: { image: "nginx:latest" } }]), /unexpected image/);
  });
  it("a remote URL (refused before anything is inspected)", async () => {
    await refused({ ...CI_ENV, TEST_DATABASE_URL: "postgresql://postgres:x@db.abcd.supabase.co:58322/postgres" }, world([CI_STACK]), /non-local host/);
  });
  it("spoofed environment variables with no matching stack running", async () => {
    const spoofed = { ...CI_ENV, CI: "true", GITHUB_ACTIONS: "true" };
    await refused(spoofed, world([]), /cannot verify container supabase_db_gym-arena-ci/);
    await refused(spoofed, world([DEV_STACK, TEST_STACK]), /cannot verify container/);
  });
  it("Docker inspection unavailable", async () => {
    await refused(CI_ENV, world([CI_STACK], { dockerDown: true }), /Docker unavailable or the stack does not exist/);
  });
  it("the local development stack impersonating CI (relabelled and re-published on the CI ports)", async () => {
    // even with every container property faked, the database reached is a different cluster
    const disguisedDev = { ...CI_STACK, systemId: DEV_STACK.systemId };
    await refused(CI_ENV, world([disguisedDev], { urlSystemId: "7400000000000000999" }), /not the database in the verified container/);
  });
  it("the protected gym-arena-test stack can never be authorized as CI", async () => {
    // URLs of the test stack under the CI profile: refused by the declared ports
    await refused({ ...CI_ENV, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321", TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:56322/postgres" }, world([CI_STACK, TEST_STACK]), /API port 56321 is not 58321/);
    // CI containers present, but TEST_DATABASE_URL somehow reaching the test stack's cluster
    await refused(CI_ENV, world([CI_STACK, TEST_STACK], { urlSystemId: TEST_STACK.systemId }), /not the database in the verified container/);
    // the test stack's own containers under the CI profile
    await refused(CI_ENV, world([TEST_STACK]), /cannot verify container supabase_db_gym-arena-ci/);
  });
  it("the protected gym-arena-test stack is refused under its own name, even with its real containers running", async () => {
    const PROTECTED_ENV = {
      GYM_ARENA_TEST_STACK: "gym-arena-test",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321",
      TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:56322/postgres",
    };
    await refused(PROTECTED_ENV, world([TEST_STACK]), /"gym-arena-test" is a protected stack/);
    await refused({ ...PROTECTED_ENV, TEST_DB_ISOLATED: "1", E2E_ALLOW_WRITES: "1" }, world([TEST_STACK, CI_STACK]), /protected stack/);
  });
  it("a database that is not a local stack (hosted JWT secret)", async () => {
    await refused(CI_ENV, world([{ ...CI_STACK, jwtSecret: "a-real-project-secret" }]), /local development JWT secret/);
  });
  it("an unreadable or malformed database identity", async () => {
    await refused(CI_ENV, world([{ ...CI_STACK, systemId: "" }]), /not the database in the verified container/);
    const p = world([CI_STACK]);
    await refused(CI_ENV, { ...p, urlIdentity: async () => { throw new Error("permission denied for function pg_control_system"); } }, /cannot read the database identity/);
  });
  it("cloud credentials present in the environment", async () => {
    await refused({ ...CI_ENV, SUPABASE_ACCESS_TOKEN: "sbp_x" }, world([CI_STACK]), /cloud credentials/);
    await refused({ ...CI_ENV, SUPABASE_DB_PASSWORD: "x" }, world([CI_STACK]), /cloud credentials/);
  });
});
