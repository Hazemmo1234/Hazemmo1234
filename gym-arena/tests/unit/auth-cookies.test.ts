import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authCookieSecure, isLocalPlainHttp, isLocalRequest, serverCookieTrust } from "@/lib/supabase/cookie-security";

// SECURITY_SPECIFICATION §1: Supabase auth cookies carry `Secure` on every deployed (HTTPS) site.
// The only exception is plain HTTP to this machine on a dev or CI server. The real-server
// counterpart of these tests is tests/integration/auth-cookies.server.test.ts (CI).

const captured = vi.hoisted(() => ({ server: [] as Array<{ cookieOptions?: { secure?: boolean } }>, browser: [] as Array<{ cookieOptions?: { secure?: boolean } }>, headers: new Headers() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
  headers: async () => captured.headers,
}));
vi.mock("@supabase/ssr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/ssr")>();
  const fake = { auth: { getUser: async () => ({ data: { user: null }, error: null }), signOut: async () => ({ error: null }) } };
  return {
    ...actual,
    createServerClient: (_u: string, _k: string, o: { cookieOptions?: { secure?: boolean } }) => (captured.server.push(o), fake),
    createBrowserClient: (_u: string, _k: string, o: { cookieOptions?: { secure?: boolean } }) => (captured.browser.push(o), fake),
  };
});

const TRUST_KEYS = ["VERCEL", "NODE_ENV", "AUTH_COOKIES_ALLOW_LOCAL_HTTP", "GITHUB_ACTIONS"] as const;

/** Runs fn with exactly these trust variables (the others removed), then restores the environment. */
async function withTrustEnv<T>(vars: Partial<Record<(typeof TRUST_KEYS)[number], string>>, fn: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(TRUST_KEYS.map((k) => [k, process.env[k]]));
  for (const k of TRUST_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

beforeEach(() => {
  captured.server = [];
  captured.browser = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ALLOWED = { onVercel: false, localHttpAllowed: true }; // trusted local config (next dev / CI)
const NONE = { onVercel: false, localHttpAllowed: false };
const VERCEL = { onVercel: true, localHttpAllowed: true };

/** What Next.js passes for a plain request from this machine (it fills X-Forwarded-* itself). */
const LOCAL = { host: "localhost:3000", "x-forwarded-host": "localhost:3000", "x-forwarded-proto": "http", "x-forwarded-port": "3000", "x-forwarded-for": "127.0.0.1" };
const h = (o: Record<string, string>) => new Headers(o);

describe("isLocalRequest: only plain HTTP from and to this machine, in every header", () => {
  it.each<[string, Record<string, string>]>([
    ["Next.js-filled local request", LOCAL],
    ["Host only", { host: "localhost:3000" }],
    ["127.0.0.1 with port", { ...LOCAL, host: "127.0.0.1:3100", "x-forwarded-host": "127.0.0.1:3100" }],
    ["IPv6 loopback", { host: "[::1]:3000", "x-forwarded-host": "[::1]:3000", "x-forwarded-for": "::1" }],
    ["IPv4-mapped loopback peer", { ...LOCAL, "x-forwarded-for": "::ffff:127.0.0.1" }],
    ["upper case", { host: "LOCALHOST:3000", "x-forwarded-host": "localhost:3000", "x-forwarded-proto": "HTTP" }],
  ])("local: %s", (_name, headers) => {
    expect(isLocalRequest(h(headers))).toBe(true);
  });

  it.each<[string, Record<string, string>]>([
    ["no headers at all", {}],
    ["empty Host", { host: "" }],
    ["public Host", { ...LOCAL, host: "arena.example.com", "x-forwarded-host": "arena.example.com" }],
    ["LAN address", { host: "192.168.1.20:3000", "x-forwarded-host": "192.168.1.20:3000", "x-forwarded-for": "192.168.1.30" }],
    ["look-alike name", { host: "localhost.evil.com" }],
    ["look-alike address", { host: "127.0.0.1.nip.io" }],
    ["two Host values", { host: "localhost:3000, arena.example.com" }],
    ["X-Forwarded-Host disagrees", { ...LOCAL, "x-forwarded-host": "evil.example" }],
    ["X-Forwarded-Host differs only by port", { ...LOCAL, "x-forwarded-host": "localhost:3001" }],
    ["X-Forwarded-Proto https", { ...LOCAL, "x-forwarded-proto": "https" }],
    ["X-Forwarded-Proto list", { ...LOCAL, "x-forwarded-proto": "http,https" }],
    ["remote peer", { ...LOCAL, "x-forwarded-for": "203.0.113.9" }],
    ["peer chain through a proxy", { ...LOCAL, "x-forwarded-for": "127.0.0.1, 203.0.113.9" }],
    ["X-Real-IP remote", { ...LOCAL, "x-real-ip": "203.0.113.9" }],
    ["Forwarded header", { ...LOCAL, forwarded: "for=127.0.0.1;host=localhost:3000;proto=http" }],
  ])("not local: %s", (_name, headers) => {
    expect(isLocalRequest(h(headers))).toBe(false);
  });
});

describe("authCookieSecure (fail-closed)", () => {
  it("only a local request on a server whose own config allows it loses Secure", () => {
    expect(authCookieSecure(h(LOCAL), ALLOWED)).toBe(false);
    expect(authCookieSecure(h({ ...LOCAL, host: "arena.example.com", "x-forwarded-host": "arena.example.com" }), ALLOWED)).toBe(true);
    expect(authCookieSecure(h({ ...LOCAL, "x-forwarded-for": "203.0.113.9" }), ALLOWED)).toBe(true);
  });

  it("headers alone never open the exception: a fully local request is Secure without trusted config", () => {
    expect(authCookieSecure(h(LOCAL), NONE)).toBe(true);
    expect(authCookieSecure(h({ host: "127.0.0.1" }), NONE)).toBe(true);
    expect(authCookieSecure(h({}), NONE)).toBe(true);
  });

  it("on a Vercel deployment nothing can turn Secure off", () => {
    const all: Array<Record<string, string>> = [LOCAL, { host: "127.0.0.1" }, {}];
    for (const headers of all) expect(authCookieSecure(h(headers), VERCEL)).toBe(true);
  });
});

describe("trust comes from the server's own environment only", () => {
  it.each<[string, Record<string, string>, boolean]>([
    ["nothing set", {}, false],
    ["production", { NODE_ENV: "production" }, false],
    ["next dev", { NODE_ENV: "development" }, true],
    ["CI flag inside GitHub Actions", { AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1", GITHUB_ACTIONS: "true" }, true],
    ["CI flag outside GitHub Actions", { AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1" }, false],
    ["CI flag with a wrong value", { AUTH_COOKIES_ALLOW_LOCAL_HTTP: "true", GITHUB_ACTIONS: "true" }, false],
    ["GitHub Actions without the flag", { GITHUB_ACTIONS: "true" }, false],
    ["GITHUB_ACTIONS other than true", { AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1", GITHUB_ACTIONS: "1" }, false],
  ])("%s → local HTTP allowed: %s", (_name, env, want) => {
    expect(serverCookieTrust(env).localHttpAllowed).toBe(want);
  });

  it("VERCEL=1 marks a Vercel deployment whatever else is set", () => {
    expect(serverCookieTrust({}).onVercel).toBe(false);
    expect(serverCookieTrust({ VERCEL: "1", AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1", GITHUB_ACTIONS: "true" })).toEqual({ onVercel: true, localHttpAllowed: true });
  });

  it("isLocalPlainHttp (the browser client's page-address check)", () => {
    expect(isLocalPlainHttp("http:", "localhost:3000")).toBe(true);
    expect(isLocalPlainHttp("http", "[::1]:3000")).toBe(true);
    expect(isLocalPlainHttp("https:", "localhost:3000")).toBe(false);
    expect(isLocalPlainHttp("http:", "localhost.evil.com")).toBe(false);
    expect(isLocalPlainHttp(null, null)).toBe(false);
  });
});

describe("the real @supabase/ssr writes auth cookies with our Secure setting", () => {
  it.each([true, false])("secure=%s", async (secure) => {
    const { createServerClient } = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const ref = "abcdefghijklmnopqrst";
    const session = { access_token: "e30.e30.sig", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "u1" } };
    const writes: Array<{ name: string; options: Record<string, unknown> }> = [];
    const client = createServerClient(`https://${ref}.supabase.co`, "anon", {
      cookieOptions: { secure },
      cookies: {
        getAll: () => [{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") }],
        setAll: (x) => {
          writes.push(...(x as typeof writes));
        },
      },
    });
    await client.auth.signOut({ scope: "local" });
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w.name).toMatch(/^sb-abcdefghijklmnopqrst-auth-token/);
      expect(w.options).toMatchObject({ secure, sameSite: "lax", path: "/" });
    }
  });
});

describe("our clients pass the setting", () => {
  // On a self-hosted server the middleware's URL is always the server's own address
  // (http://localhost:<port>); the Host header carries what the client asked for.
  const req = (headers: Record<string, string>) => new NextRequest("http://localhost:3000/login", { headers });
  const CI = { AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1", GITHUB_ACTIONS: "true" };

  it("middleware: decides from the request headers, not from request.nextUrl", async () => {
    const { middleware } = await import("@/middleware");
    const run = (env: Parameters<typeof withTrustEnv>[0], headers: Record<string, string>) => withTrustEnv(env, () => middleware(req(headers)));
    await run({ NODE_ENV: "production" }, LOCAL); // no trusted config → Secure
    await run({ AUTH_COOKIES_ALLOW_LOCAL_HTTP: "1" }, LOCAL); // flag outside CI → Secure
    await run(CI, LOCAL); // CI server, local request → exempt
    await run(CI, { ...LOCAL, host: "arena.example.com", "x-forwarded-host": "arena.example.com" }); // URL says localhost, client asked for a public host → Secure
    await run(CI, { ...LOCAL, "x-forwarded-host": "evil.example" }); // forged forwarding → Secure
    await run(CI, { ...LOCAL, "x-forwarded-for": "192.168.1.30" }); // another machine → Secure
    await run({ ...CI, VERCEL: "1" }, LOCAL); // Vercel → Secure
    await run({ NODE_ENV: "development" }, LOCAL); // next dev, local → exempt
    await run({ NODE_ENV: "development" }, { host: "192.168.1.20:3000", "x-forwarded-host": "192.168.1.20:3000", "x-forwarded-for": "192.168.1.30" }); // next dev, LAN client → Secure
    expect(captured.server.map((o) => o.cookieOptions?.secure)).toEqual([true, true, false, true, true, true, true, false, true]);
  });

  it("server client: the same rule from the request headers", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    const cases: Array<Record<string, string>> = [LOCAL, { ...LOCAL, host: "arena.example.com", "x-forwarded-host": "arena.example.com" }, { ...LOCAL, "x-forwarded-proto": "https" }, {}];
    for (const env of [{ NODE_ENV: "production" }, CI, { ...CI, VERCEL: "1" }]) {
      await withTrustEnv(env, async () => {
        for (const headers of cases) {
          captured.headers = new Headers(headers);
          await createClient();
        }
      });
    }
    expect(captured.server.map((o) => o.cookieOptions?.secure)).toEqual([
      true, true, true, true, // no trusted config: always Secure, whatever the headers say
      false, true, true, true, // CI: only the local request is exempt
      true, true, true, true, // Vercel: always Secure
    ]);
  });

  it("browser client: follows the page's protocol and host; Secure without a window", async () => {
    const { createClient } = await import("@/lib/supabase/client");
    createClient(); // no window (server render)
    vi.stubGlobal("window", { location: { protocol: "https:", host: "arena.example.com" } });
    createClient();
    vi.stubGlobal("window", { location: { protocol: "http:", host: "localhost:3000" } });
    createClient();
    vi.stubGlobal("window", { location: { protocol: "http:", host: "192.168.1.20:3000" } });
    createClient();
    expect(captured.browser.map((o) => o.cookieOptions?.secure)).toEqual([true, true, false, true]);
  });
});
