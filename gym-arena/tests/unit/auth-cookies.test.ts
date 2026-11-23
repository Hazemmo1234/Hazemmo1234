import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authCookieSecure } from "@/lib/supabase/cookie-security";

// SECURITY_SPECIFICATION §1: Supabase auth cookies carry `Secure` on every deployed (HTTPS) site.
// The only exception is plain HTTP to this machine (local dev and the CI browser suite).

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

beforeEach(() => {
  captured.server = [];
  captured.browser = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authCookieSecure (fail-closed)", () => {
  it.each([
    ["https", "arena.example.com", true],
    ["https:", "gym-arena-staging.vercel.app", true],
    ["https,http", "arena.example.com", true],
    ["http", "arena.example.com", true], // a public host over plain HTTP still gets Secure
    [null, "arena.example.com", true],
    [undefined, undefined, true],
    ["", "", true],
    ["https", "localhost:3000", true],
    ["http", "localhost:3000", false],
    ["http:", "127.0.0.1:3100", false],
    ["http", "127.0.0.1", false],
    ["http", "[::1]:3000", false],
    ["HTTP", "LOCALHOST", false],
    ["http", "localhost.evil.com", true],
    ["http", "127.0.0.1.nip.io", true],
  ])("protocol %s, host %s → secure %s", (proto, host, want) => {
    expect(authCookieSecure(proto as string | null | undefined, host as string | null | undefined)).toBe(want);
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
  it("middleware: Secure on an HTTPS host, not on http://localhost", async () => {
    const { middleware } = await import("@/middleware");
    await middleware(new NextRequest("https://arena.example.com/login"));
    await middleware(new NextRequest("http://localhost:3000/login"));
    expect(captured.server.map((o) => o.cookieOptions?.secure)).toEqual([true, false]);
  });

  it("server client: follows the forwarded protocol and host; Secure when they are missing", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    const cases: Array<Record<string, string>> = [
      { "x-forwarded-proto": "https", host: "arena.example.com" },
      { "x-forwarded-proto": "http", host: "localhost:3000" },
      { host: "arena.example.com" },
      {},
    ];
    for (const h of cases) {
      captured.headers = new Headers(h);
      await createClient();
    }
    expect(captured.server.map((o) => o.cookieOptions?.secure)).toEqual([true, false, true, true]);
  });

  it("browser client: follows the page's protocol and host; Secure without a window", async () => {
    const { createClient } = await import("@/lib/supabase/client");
    createClient(); // no window (server render)
    vi.stubGlobal("window", { location: { protocol: "https:", host: "arena.example.com" } });
    createClient();
    vi.stubGlobal("window", { location: { protocol: "http:", host: "localhost:3000" } });
    createClient();
    expect(captured.browser.map((o) => o.cookieOptions?.secure)).toEqual([true, true, false]);
  });
});
