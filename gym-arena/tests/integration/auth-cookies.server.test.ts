/**
 * Real-server check of the auth-cookie rule (SECURITY_SPECIFICATION §1,
 * src/lib/supabase/cookie-security.ts). Unit tests prove the decision; this proves what a real
 * Next.js server actually sends.
 *
 * For each server configuration it starts the production build (`next start`, attested in the
 * global setup) or `next dev` on its own port, hands it a signed-in session whose expiry is in
 * the past, and reads the Set-Cookie the middleware sends when it refreshes that session.
 * Only cookie names and attributes are read; values are never printed.
 *
 * Guards against judging the wrong server: each port must be free before its server starts, and
 * every `next start` server must be serving exactly the attested build before any request.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { connect } from "node:net";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { attestBuild, verifyServedBuild, type BuildAttestation } from "../support/build-attestation";

const APP_DIR = resolve(__dirname, "..", "..");
const NEXT_BIN = join(APP_DIR, "node_modules", "next", "dist", "bin", "next");
/** seed account (supabase/seed.sql); it exists only on the job's disposable local stack */
const ADMIN = { email: "admin@gym-arena.local", password: "Password123!" };
/** the variables a scenario controls; every server starts without them, then gets the scenario's */
const CONTROLLED = ["VERCEL", "NODE_ENV", "AUTH_COOKIES_ALLOW_LOCAL_HTTP", "GITHUB_ACTIONS", "NEXT_DIST_DIR"];
const DEV_DIST = ".next-cookie-dev";

type Session = Record<string, unknown>;
let apiUrl = "";
let anonKey = "";
let cookieName = "";
let build: BuildAttestation;
let session: Session;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signIn(): Promise<Session> {
  // one sign-in for the whole file (Auth rate-limits sign-ins; refreshes have a far higher limit)
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    if (r.ok) return (await r.json()) as Session;
    if (r.status !== 429 || attempt >= 12) throw new Error(`seed admin sign-in failed: HTTP ${r.status}`);
    await sleep(15_000);
  }
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((done) => {
    const s = connect({ host: "127.0.0.1", port });
    s.once("connect", () => (s.destroy(), done(true)));
    s.once("error", () => done(false));
  });
}

interface Server {
  port: number;
  child: ChildProcess;
  output: string[];
}

async function startServer(mode: "start" | "dev", port: number, vars: Record<string, string>): Promise<Server> {
  if (await portInUse(port)) throw new Error(`port ${port} is already in use: refusing, another server would answer for this scenario`);
  const env: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  for (const k of CONTROLLED) delete env[k];
  Object.assign(env, vars);
  const child: ChildProcess = spawn(process.execPath, [NEXT_BIN, mode, "-p", String(port)], {
    cwd: APP_DIR,
    env: env as NodeJS.ProcessEnv,
    detached: true, // its own process group, so stopServer can end next-server too
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  const keep = (b: Buffer) => {
    output.push(...b.toString().split("\n"));
    output.splice(0, Math.max(0, output.length - 200)); // the last 200 lines, for failure messages
  };
  child.stdout!.on("data", keep);
  child.stderr!.on("data", keep);
  const server = { port, child, output };
  const deadline = Date.now() + (mode === "dev" ? 180_000 : 60_000);
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next ${mode} exited (${child.exitCode}):\n${output.slice(-20).join("\n")}`);
    const ok = await fetch(`http://127.0.0.1:${port}/login`).then((r) => r.status === 200, () => false);
    if (ok) break;
    if (Date.now() > deadline) {
      await stopServer(server);
      throw new Error(`next ${mode} did not answer on port ${port}:\n${output.slice(-20).join("\n")}`);
    }
    await sleep(500);
  }
  if (mode === "start") await verifyServedBuild(`http://127.0.0.1:${port}`, build);
  return server;
}

async function stopServer(s: Server): Promise<void> {
  // the whole process group: `next start` serves from a child process (next-server)
  const kill = (sig: NodeJS.Signals) => {
    try {
      process.kill(-s.child.pid!, sig);
    } catch {
      /* already gone */
    }
  };
  kill("SIGTERM");
  for (let i = 0; i < 40 && (await portInUse(s.port)); i++) {
    if (i === 20) kill("SIGKILL");
    await sleep(250);
  }
  if (await portInUse(s.port)) throw new Error(`server on port ${s.port} did not stop`);
}

interface Written {
  name: string;
  secure: boolean;
  attributes: string;
}

/** One request with an expired session: returns the auth cookies the server wrote. */
async function probe(port: number, headers: Record<string, string>): Promise<Written[]> {
  const expired = { ...session, expires_at: Math.floor(Date.now() / 1000) - 120 };
  const value = "base64-" + Buffer.from(JSON.stringify(expired)).toString("base64url");
  const res = await new Promise<IncomingMessage>((ok, fail) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: "/admin/dashboard", method: "GET", headers: { host: `localhost:${port}`, ...headers, cookie: `${cookieName}=${value}` } },
      ok,
    );
    req.on("error", fail);
    req.setTimeout(180_000, () => req.destroy(new Error("request timed out")));
    req.end();
  });
  res.resume();
  await new Promise((r) => res.on("end", r));
  expect(res.statusCode, "the protected page answers (the refreshed session is valid)").toBe(200);
  const written = (res.headers["set-cookie"] ?? [])
    .filter((c) => c.startsWith(`${cookieName}=`) || c.startsWith(`${cookieName}.`))
    .filter((c) => !/;\s*max-age=0\b/i.test(c));
  expect(written.length, "the middleware refreshed the session and wrote the auth cookie").toBeGreaterThan(0);
  // keep the rotated session for the next request (refresh tokens are single-use)
  const parts = written
    .map((c) => {
      const [pair] = c.split(";");
      const eq = pair!.indexOf("=");
      return { name: pair!.slice(0, eq), value: decodeURIComponent(pair!.slice(eq + 1)) };
    })
    .sort((a, b) => Number(a.name.split(".")[1] ?? 0) - Number(b.name.split(".")[1] ?? 0));
  const joined = parts.map((p) => p.value).join("");
  session = JSON.parse(Buffer.from(joined.replace(/^base64-/, ""), "base64url").toString("utf8")) as Session;
  return written.map((c) => ({
    name: c.split("=")[0]!,
    secure: /;\s*secure\b/i.test(c),
    attributes: c.split(";").slice(1).map((a) => a.trim()).filter((a) => !/^expires=/i.test(a)).join("; "),
  }));
}

/** [label, extra request headers, expected Secure] */
type Case = [string, Record<string, string>, boolean];
const local: Case = ["local request (Host localhost)", {}, false];

function scenario(title: string, mode: "start" | "dev", port: number, vars: Record<string, string>, cases: Case[]) {
  describe(title, () => {
    let server: Server | undefined;
    let snapshot: Record<string, string | null> = {};
    beforeAll(async () => {
      if (mode === "dev") {
        // next dev may add its build folder to these two files; they are put back afterwards
        snapshot = Object.fromEntries(["tsconfig.json", "next-env.d.ts"].map((f) => [f, existsSync(join(APP_DIR, f)) ? readFileSync(join(APP_DIR, f), "utf8") : null]));
      }
      server = await startServer(mode, port, vars);
    });
    afterAll(async () => {
      if (server) await stopServer(server);
      if (mode === "dev") {
        for (const [f, content] of Object.entries(snapshot)) {
          if (content === null) rmSync(join(APP_DIR, f), { force: true });
          else if (readFileSync(join(APP_DIR, f), "utf8") !== content) writeFileSync(join(APP_DIR, f), content);
        }
        rmSync(join(APP_DIR, DEV_DIST), { recursive: true, force: true });
      }
    });
    it.each(cases)("%s %j → Secure: %s", async (_label, headers, wantSecure) => {
      const written = await probe(port, headers);
      for (const w of written) {
        expect(w.secure, `${w.name} [${w.attributes}]`).toBe(wantSecure);
        expect(w.attributes).toMatch(/samesite=lax/i);
        expect(w.attributes).toMatch(/path=\//i);
      }
    });
  });
}

beforeAll(async () => {
  apiUrl = inject("cookieTestApiUrl");
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  cookieName = `sb-${new URL(apiUrl).hostname.split(".")[0]}-auth-token`;
  build = attestBuild(APP_DIR, process.env, apiUrl);
  session = await signIn();
});

scenario("production build, no exception configured (any non-Vercel host)", "start", 3201, {}, [
  ["local request", {}, true],
  ["every header claims a local request", { "x-forwarded-host": "localhost:3201", "x-forwarded-proto": "http", "x-forwarded-for": "127.0.0.1" }, true],
]);

scenario("production build, CI flag outside GitHub Actions", "start", 3202, { AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1" }, [["local request", {}, true]]);

scenario("production build started with NODE_ENV=development", "start", 3203, { NODE_ENV: "development" }, [["local request", {}, true]]);

scenario("production build on Vercel (VERCEL=1), even with the CI flag", "start", 3204, { VERCEL: "1", AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1", GITHUB_ACTIONS: "true" }, [
  ["local request", {}, true],
]);

scenario("production build, CI browser-job configuration (flag + GITHUB_ACTIONS=true)", "start", 3205, { AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1", GITHUB_ACTIONS: "true" }, [
  local,
  ["Host 127.0.0.1", { host: "127.0.0.1:3205" }, false],
  ["Host a public name (the old bug: the URL still says localhost)", { host: "arena.example.com" }, true],
  ["Host a look-alike name", { host: "localhost.evil.com" }, true],
  ["X-Forwarded-Host forged", { "x-forwarded-host": "evil.example" }, true],
  ["X-Forwarded-Proto https", { "x-forwarded-proto": "https" }, true],
  ["X-Forwarded-For another machine", { "x-forwarded-for": "203.0.113.9" }, true],
  ["Forwarded header", { forwarded: "for=203.0.113.9;proto=http" }, true],
]);

scenario("next dev (local development)", "dev", 3206, { NEXT_DIST_DIR: DEV_DIST }, [
  local,
  ["Host a LAN address", { host: "192.168.1.20:3206" }, true],
  ["X-Forwarded-For another machine", { "x-forwarded-for": "192.168.1.30" }, true],
]);
