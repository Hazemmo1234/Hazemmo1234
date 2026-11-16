/**
 * Proves that the stack a test run is about to WRITE to is really the test stack it claims to
 * be — from the actual running resources, never from environment variables alone.
 *
 * resolveWriteTarget (write-target.ts) checks the declared profile and URLs. This module then
 * inspects what is really there, and FAILS CLOSED on anything it cannot establish:
 *  1. the profile's database and API containers (supabase_db_<project>, supabase_kong_<project>)
 *     exist, are running, carry the Supabase CLI project label <project> and the expected image;
 *  2. they publish exactly the profile's DB and API ports (so the URLs reach these containers);
 *  3. the database container's data directory is the volume supabase_db_<project>;
 *  4. the database reached through TEST_DATABASE_URL is the SAME Postgres cluster as the one in
 *     that container (pg_control_system().system_identifier, read both ways), and it uses the
 *     local development JWT secret (never a real project's);
 *  5. no cloud credentials are present.
 * Setting environment variables (CI=true, GITHUB_ACTIONS=true, the profile, the CI flag) can
 * never satisfy 1–4: a matching stack must actually exist and be the one the URLs reach.
 *
 * Used centrally before any test can write: tests/db/global-setup.ts (Vitest DB suite) and
 * e2e/global-setup.ts (Playwright).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { WriteTargetError, resolveWriteTarget, type StackProfile, type WriteTarget } from "./write-target";

const run = promisify(execFile);

/** The JWT secret of every LOCAL Supabase CLI stack; a hosted project never uses it. */
export const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
/** Label the Supabase CLI puts on every container of a local stack. */
export const PROJECT_LABEL = "com.supabase.cli.project";
const DB_IMAGE = /^(public\.ecr\.aws\/)?supabase\/postgres:/;
const API_IMAGE = /kong:/;

export interface ContainerInfo {
  name: string;
  running: boolean;
  image: string;
  labels: Readonly<Record<string, string>>;
  /** "5432/tcp" → published host ports */
  ports: Readonly<Record<string, ReadonlyArray<{ HostIp: string; HostPort: string }> | null>>;
  mounts: ReadonlyArray<{ Type: string; Name?: string; Destination: string }>;
}

/** What the verifier needs from the outside world — injectable so every refusal is testable. */
export interface IdentityProbe {
  /** docker inspect of one container; throws if Docker is unavailable or it does not exist */
  inspect(container: string): Promise<ContainerInfo>;
  /** system identifier of the cluster INSIDE the container (docker exec psql) */
  containerSystemId(container: string): Promise<string>;
  /** system identifier and JWT secret of the cluster reached through the URL */
  urlIdentity(dbUrl: string): Promise<{ systemId: string; jwtSecret: string }>;
}

export interface VerifiedTarget extends WriteTarget {
  project: StackProfile;
  dbContainer: string;
  apiContainer: string;
  volume: string;
  systemId: string;
}

const SYSTEM_ID_SQL = "select system_identifier::text from pg_control_system()";

/** The real probe: the docker CLI (honours DOCKER_HOST) and a direct Postgres connection. */
export function dockerProbe(): IdentityProbe {
  return {
    async inspect(container) {
      const { stdout } = await run("docker", ["inspect", "--type", "container", container], { timeout: 20_000 });
      const [c] = JSON.parse(stdout) as Array<{
        Name: string;
        State: { Running: boolean };
        Config: { Image: string; Labels: Record<string, string> | null };
        NetworkSettings: { Ports: ContainerInfo["ports"] | null };
        Mounts: ContainerInfo["mounts"] | null;
      }>;
      return {
        name: c.Name.replace(/^\//, ""),
        running: c.State.Running,
        image: c.Config.Image,
        labels: c.Config.Labels ?? {},
        ports: c.NetworkSettings.Ports ?? {},
        mounts: c.Mounts ?? [],
      };
    },
    async containerSystemId(container) {
      const { stdout } = await run("docker", ["exec", container, "psql", "-U", "postgres", "-Atc", SYSTEM_ID_SQL], { timeout: 20_000 });
      return stdout.trim();
    },
    async urlIdentity(dbUrl) {
      const sql = postgres(dbUrl, { max: 1, onnotice: () => {}, connect_timeout: 10 });
      try {
        const [row] = await sql.unsafe("select system_identifier::text as id, current_setting('app.settings.jwt_secret', true) as secret from pg_control_system()");
        return { systemId: String(row.id ?? ""), jwtSecret: String(row.secret ?? "") };
      } finally {
        await sql.end();
      }
    },
  };
}

const publishes = (c: ContainerInfo, containerPort: string, hostPort: string) =>
  (c.ports[containerPort] ?? []).some((b) => b.HostPort === hostPort && ["", "0.0.0.0", "127.0.0.1", "::"].includes(b.HostIp));

async function inspectOrRefuse(probe: IdentityProbe, container: string): Promise<ContainerInfo> {
  try {
    return await probe.inspect(container);
  } catch (e) {
    throw new WriteTargetError(`cannot verify container ${container} (Docker unavailable or the stack does not exist): ${(e as Error).message.split("\n")[0]}`);
  }
}

/** Full verification. Throws WriteTargetError (fail closed) unless every check passes. */
export async function verifyWriteTarget(env: Readonly<Record<string, string | undefined>>, probe: IdentityProbe = dockerProbe()): Promise<VerifiedTarget> {
  const target = resolveWriteTarget(env);
  if (env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_DB_PASSWORD) throw new WriteTargetError("cloud credentials are present in the environment");

  const project = target.profile;
  const dbContainer = `supabase_db_${project}`;
  const apiContainer = `supabase_kong_${project}`;
  const volume = `supabase_db_${project}`;
  const apiPort = new URL(target.apiUrl).port;
  const dbPort = new URL(target.dbUrl).port;

  const db = await inspectOrRefuse(probe, dbContainer);
  const api = await inspectOrRefuse(probe, apiContainer);
  for (const c of [db, api]) {
    if (!c.running) throw new WriteTargetError(`container ${c.name} is not running`);
    if (c.labels[PROJECT_LABEL] !== project) throw new WriteTargetError(`container ${c.name} belongs to project "${c.labels[PROJECT_LABEL] ?? "(none)"}", not "${project}"`);
  }
  if (db.name !== dbContainer || api.name !== apiContainer) throw new WriteTargetError("inspected containers do not have the expected names");
  if (!DB_IMAGE.test(db.image)) throw new WriteTargetError(`database container runs an unexpected image (${db.image})`);
  if (!API_IMAGE.test(api.image)) throw new WriteTargetError(`API container runs an unexpected image (${api.image})`);
  if (!publishes(db, "5432/tcp", dbPort)) throw new WriteTargetError(`${dbContainer} does not publish the database on port ${dbPort}`);
  if (!publishes(api, "8000/tcp", apiPort)) throw new WriteTargetError(`${apiContainer} does not publish the API on port ${apiPort}`);
  const data = db.mounts.filter((m) => m.Destination === "/var/lib/postgresql/data");
  if (data.length !== 1 || data[0].Type !== "volume" || data[0].Name !== volume) {
    throw new WriteTargetError(`${dbContainer} does not keep its data in the volume ${volume}`);
  }

  // the database the tests will connect to IS the database in that container
  let inside: string, reached: { systemId: string; jwtSecret: string };
  try {
    [inside, reached] = await Promise.all([probe.containerSystemId(dbContainer), probe.urlIdentity(target.dbUrl)]);
  } catch (e) {
    throw new WriteTargetError(`cannot read the database identity: ${(e as Error).message.split("\n")[0]}`);
  }
  if (!/^\d{10,}$/.test(inside) || inside !== reached.systemId) {
    throw new WriteTargetError("the database reached through TEST_DATABASE_URL is not the database in the verified container");
  }
  if (reached.jwtSecret !== LOCAL_JWT_SECRET) throw new WriteTargetError("the database does not use the local development JWT secret (not a local stack)");

  return { ...target, project, dbContainer, apiContainer, volume, systemId: inside };
}
