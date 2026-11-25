import { describe, expect, it } from "vitest";
import { cspRefs, verifyStaging } from "../../scripts/staging-verify-core";

const STG = "stagstagstagstagstag";
const PROD = "prodprodprodprodprod";
const SITE = "https://gym-arena-staging.vercel.app";
const SUPA = `https://${STG}.supabase.co`;
const ANON = "anon-key-value-never-printed";

type Route = { status: number; headers?: Record<string, string>; json?: unknown };
function fakeFetch(routes: Record<string, Route>, calls: Array<{ url: string; method: string }>) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    const path = url.replace(SITE, "site:").replace(SUPA, "supa:");
    const key = Object.keys(routes).filter((k) => path.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    if (!key) throw new Error("network down");
    const r = routes[key]!;
    return new Response(r.json === undefined ? "" : JSON.stringify(r.json), { status: r.status, headers: r.headers });
  }) as typeof fetch;
}

const healthy = (): Record<string, Route> => ({
  "site:/login": { status: 200, headers: { "content-security-policy": `default-src 'self'; connect-src 'self' ${SUPA} wss://${STG}.supabase.co` } },
  "site:/api/tv/state": { status: 401 },
  "site:/api/cron/snapshot": { status: 401 },
  "site:/api/me": { status: 401 },
  "supa:/auth/v1/settings": { status: 200, json: { disable_signup: true } },
  "supa:/rest/v1/": { status: 401 },
});

const run = (routes: Record<string, Route>, calls: Array<{ url: string; method: string }> = []) =>
  verifyStaging({ site: `${SITE}/`, supabaseUrl: SUPA, anonKey: ANON, stagingRef: STG, prodRef: PROD, fetch: fakeFetch(routes, calls) });
const byCheck = async (routes: Record<string, Route>) => Object.fromEntries((await run(routes)).map((r) => [r.check, r]));

describe("staging verification (read-only)", () => {
  it("passes a healthy staging deployment using GET requests only, printing no key", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const results = await run(healthy(), calls);
    expect(results.filter((r) => r.status !== "PASS")).toEqual([]);
    expect(results.length).toBe(14); // login, binding, 4 endpoints, sign-up, 7 tables
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(JSON.stringify(results)).not.toContain(ANON);
  });

  it("fails when the deployed build is bound to production, to nothing, or to another project", async () => {
    const r = healthy();
    r["site:/login"] = { status: 200, headers: { "content-security-policy": `connect-src https://${PROD}.supabase.co` } };
    expect((await byCheck(r))["build bound to project"]!.detail).toContain("PRODUCTION");
    r["site:/login"] = { status: 200, headers: {} };
    expect((await byCheck(r))["build bound to project"]!.detail).toContain("Redeploy");
    r["site:/login"] = { status: 200, headers: { "content-security-policy": "connect-src https://otherotherotherother.supabase.co" } };
    expect((await byCheck(r))["build bound to project"]!.status).toBe("FAIL");
  });

  it("fails on an unreachable or broken site and on open endpoints", async () => {
    const r = healthy();
    delete (r as Record<string, Route | undefined>)["site:/login"];
    r["site:/api/tv/state"] = { status: 200 };
    r["site:/api/cron/snapshot"] = { status: 500 };
    const c = await byCheck(r);
    expect(c["site /login"]!.status).toBe("FAIL");
    expect(c["TV state without key"]!.detail).toContain("200");
    expect(c["cron job without secret"]!.status).toBe("FAIL");
    const r2 = healthy();
    r2["site:/login"] = { status: 500 };
    delete (r2 as Record<string, Route | undefined>)["site:/api/me"];
    const c2 = await byCheck(r2);
    expect(c2["site /login"]!.detail).toContain("500");
    expect(c2["staff API without session"]!.detail).toBe("no response");
  });

  it("fails when sign-up is enabled or the settings cannot be read", async () => {
    const r = healthy();
    r["supa:/auth/v1/settings"] = { status: 200, json: { disable_signup: false } };
    expect((await byCheck(r))["sign-up disabled"]!.detail).toContain("ENABLED");
    r["supa:/auth/v1/settings"] = { status: 401 };
    expect((await byCheck(r))["sign-up disabled"]!.status).toBe("FAIL");
    delete (r as Record<string, Route | undefined>)["supa:/auth/v1/settings"];
    expect((await byCheck(r))["sign-up disabled"]!.detail).toContain("none");
  });

  it("fails when the anonymous key can read a table", async () => {
    const r = healthy();
    r["supa:/rest/v1/app_settings"] = { status: 200, json: [] };
    const c = await byCheck(r);
    expect(c["anon read app_settings"]!.status).toBe("FAIL");
    expect(c["anon read members"]!.status).toBe("PASS");
    delete (r as Record<string, Route | undefined>)["supa:/rest/v1/"];
    delete (r as Record<string, Route | undefined>)["supa:/rest/v1/app_settings"];
    expect((await byCheck(r))["anon read members"]!.detail).toBe("no response");
  });

  it("reads project refs from a CSP", () => {
    expect(cspRefs(`img-src ${SUPA}; connect-src ${SUPA} wss://${STG}.supabase.co`)).toEqual([STG]);
    expect(cspRefs("default-src 'self'")).toEqual([]);
  });
});
