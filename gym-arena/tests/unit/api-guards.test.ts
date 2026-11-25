/// <reference types="vite/client" />
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Behavioural guard test (SECURITY_SPECIFICATION §1, D19): every exported handler of every API
// route is CALLED. Only the session boundary is faked: the server Supabase client answers
// "signed out" or "active coach", and every table read is recorded. The service-role client
// and the TV settings reader throw if touched. A new route without a guard, a guard placed
// after a data read, or an admin route a coach can reach fails here.

type Scenario = { user: { id: string } | null; profile: Record<string, unknown> | null };
const COACH_ID = "00000000-0000-4000-a000-000000000011";
const state = vi.hoisted(() => ({
  scenario: { user: null, profile: null } as Scenario,
  tables: [] as string[],
  eqs: [] as Array<[string, unknown]>,
  updates: [] as Array<[string, unknown]>,
  serviceCalls: 0,
  tvSettingsCalls: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const chain = (table: string): Record<string, unknown> => {
      const q: Record<string, unknown> = {};
      const self = () => q;
      for (const m of ["select", "insert", "upsert", "delete", "in", "order", "limit", "range", "is", "not", "gte", "lte", "neq", "or", "match", "filter"]) q[m] = self;
      q.update = (v: unknown) => (state.updates.push([table, v]), q);
      q.eq = (c: string, v: unknown) => (state.eqs.push([c, v]), q);
      q.maybeSingle = async () => ({ data: table === "profiles" ? state.scenario.profile : null, error: null });
      q.single = q.maybeSingle;
      q.then = (res: (v: unknown) => unknown) => res({ data: [], error: null, count: 0 });
      return q;
    };
    return {
      auth: { getUser: async () => ({ data: { user: state.scenario.user }, error: null }), signOut: async () => ({ error: null }) },
      from: (table: string) => (state.tables.push(table), chain(table)),
      rpc: async () => ({ data: null, error: { message: "not in this test" } }),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }), upload: async () => ({ error: null }) }) },
    };
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    state.serviceCalls++;
    throw new Error("service-role client touched");
  },
}));
vi.mock("@/modules/tv/settings", () => ({
  getTvSettings: async () => (state.tvSettingsCalls++, { tvKey: "a".repeat(48), locale: "ar", gymName: "DFN GYM" }),
}));

const API = join(__dirname, "..", "..", "src", "app", "api");
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
const PUBLIC = new Set(["tv/state", "cron/snapshot", "locale"]);
// Handlers an active coach may use (API_SPECIFICATION roles). Every other handler is admin-only.
const COACH_ALLOWED = new Set([
  "POST attendance",
  "GET entries/[id]/photo", "POST entries/[id]/void", "POST entries/preview", "POST entries",
  "GET leaderboard", "GET me", "PATCH me",
  "GET members", "POST members", "GET members/[id]", "PATCH members/[id]", "PATCH members/[id]/plan",
  "GET seasons", "GET seasons/[id]/results",
  "POST uploads/avatar", "POST uploads/evidence",
]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : name === "route.ts" ? [p] : [];
  });
}
// Static glob (resolved at build time, no computed module path — see e2e-import-graph.test.ts).
const loaders = import.meta.glob("../../src/app/api/**/route.ts");
const routeOf = (key: string) => key.replace(/^.*\/src\/app\/api\//, "").replace(/\/route\.ts$/, "");
const routes = Object.keys(loaders).map((file) => ({ file, route: routeOf(file) }));
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const load = async (file: string) => (await loaders[file]!()) as Record<string, Handler>;

async function call(route: string, file: string, method: string, init: { headers?: Record<string, string>; body?: unknown; query?: string } = {}) {
  const mod = await load(file);
  const url = `http://localhost:3000/api/${route.replace(/\[id\]/g, COACH_ID)}${init.query ?? ""}`;
  const body = method === "GET" ? undefined : JSON.stringify(init.body ?? {});
  const req = new NextRequest(url, { method, headers: { "content-type": "application/json", ...init.headers }, body });
  return mod[method]!(req, { params: Promise.resolve({ id: COACH_ID }) });
}

beforeEach(() => {
  state.tables = [];
  state.eqs = [];
  state.updates = [];
  state.serviceCalls = 0;
  state.tvSettingsCalls = 0;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("API route guards (behavioural)", () => {
  it("finds every route and handler", async () => {
    expect(routes.length).toBeGreaterThanOrEqual(28);
    // the glob sees exactly the route files on disk
    const onDisk = routeFiles(API).map((f) => relative(API, f).split("\\").join("/").replace(/\/route\.ts$/, "")).sort();
    expect(routes.map((r) => r.route).sort()).toEqual(onDisk);
    let handlers = 0;
    for (const { file } of routes) {
      const mod = await load(file);
      handlers += METHODS.filter((m) => m in mod).length;
    }
    expect(handlers).toBeGreaterThanOrEqual(38);
  });

  it("signed out: every protected handler answers 401 before reading any data", async () => {
    state.scenario = { user: null, profile: null };
    const wrong: string[] = [];
    for (const { file, route } of routes.filter((r) => !PUBLIC.has(r.route))) {
      const mod = await load(file);
      for (const m of METHODS.filter((x) => x in mod)) {
        state.tables = [];
        const res = await call(route, file, m);
        if (res.status !== 401 || state.tables.length > 0) wrong.push(`${m} ${route} → ${res.status}, read ${state.tables.join(",") || "nothing"}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(state.serviceCalls).toBe(0);
  });

  it("active coach: every admin-only handler answers 403 after reading only the caller's profile", async () => {
    state.scenario = { user: { id: COACH_ID }, profile: { id: COACH_ID, role: "coach", is_active: true, full_name: "Coach", locale: "en" } };
    const wrong: string[] = [];
    const seen = new Set<string>();
    for (const { file, route } of routes.filter((r) => !PUBLIC.has(r.route))) {
      const mod = await load(file);
      for (const m of METHODS.filter((x) => x in mod)) {
        const key = `${m} ${route}`;
        seen.add(key);
        if (COACH_ALLOWED.has(key)) continue;
        state.tables = [];
        const res = await call(route, file, m);
        if (res.status !== 403 || state.tables.some((t) => t !== "profiles")) wrong.push(`${key} → ${res.status}, read ${state.tables.join(",")}`);
      }
    }
    expect(wrong).toEqual([]);
    expect([...COACH_ALLOWED].filter((k) => !seen.has(k))).toEqual([]); // the allow-list names real handlers only
    expect(state.serviceCalls).toBe(0);
  });

  it("active coach: the coach handlers pass the role gate (any answer but 401/403 from the guard)", async () => {
    state.scenario = { user: { id: COACH_ID }, profile: { id: COACH_ID, role: "coach", is_active: true, full_name: "Coach", locale: "en" } };
    const statuses: Record<string, number> = {};
    for (const key of COACH_ALLOWED) {
      const [m, route] = key.split(" ") as [string, string];
      const r = routes.find((x) => x.route === route)!;
      const res = await call(route, r.file, m);
      statuses[key] = res.status;
      const body = res.status === 403 || res.status === 401 ? await res.json() : null;
      expect(body?.error?.message ?? "", key).not.toMatch(/Admin only|Not allowed for this role|Sign in required/);
    }
    expect(Object.keys(statuses).length).toBe(COACH_ALLOWED.size);
  });

  it("an inactive staff profile is treated as signed out", async () => {
    state.scenario = { user: { id: COACH_ID }, profile: { id: COACH_ID, role: "admin", is_active: false } };
    const r = routes.find((x) => x.route === "audit")!;
    expect((await call(r.route, r.file, "GET")).status).toBe(401);
  });
});

describe("public endpoints", () => {
  const route = (name: string) => routes.find((r) => r.route === name)!;

  it("TV state: no key or a wrong key → 401 with no board data and no state built", async () => {
    const r = route("tv/state");
    for (const query of ["", "?key=", `?key=${"b".repeat(48)}`, `?key=${"a".repeat(47)}`]) {
      const res = await call(r.route, r.file, "GET", { query });
      expect(res.status, query).toBe(401);
      expect(JSON.stringify(await res.json())).not.toMatch(/board|gym_name|season/);
    }
    expect(state.serviceCalls).toBe(0);
    expect(state.tables).toEqual([]);
  });

  it("cron: refused without the secret, with a wrong secret, and when no secret is configured", async () => {
    const r = route("cron/snapshot");
    expect((await call(r.route, r.file, "GET")).status).toBe(401); // no CRON_SECRET configured
    process.env.CRON_SECRET = "s".repeat(24);
    for (const h of [undefined, "Bearer wrong", `Bearer ${"s".repeat(23)}`, "s".repeat(24)]) {
      const res = await call(r.route, r.file, "GET", { headers: h ? { authorization: h } : {} });
      expect(res.status, String(h)).toBe(401);
    }
    process.env.CRON_SECRET = "short";
    expect((await call(r.route, r.file, "GET", { headers: { authorization: "Bearer short" } })).status).toBe(401);
    expect(state.serviceCalls).toBe(0);
  });

  it("locale: returns only the chosen language; signed out it reads and writes no data", async () => {
    const r = route("locale");
    state.scenario = { user: null, profile: null };
    const res = await call(r.route, r.file, "POST", { body: { locale: "en" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ locale: "en" });
    expect(state.tables).toEqual([]);
    expect((await call(r.route, r.file, "POST", { body: { locale: "fr" } })).status).toBe(422);
    expect((await call(r.route, r.file, "POST", { body: { locale: "en", role: "admin" } })).status).toBe(422); // strict schema
  });

  it("locale: signed in, it updates only the caller's own profile row and only the locale", async () => {
    const r = route("locale");
    state.scenario = { user: { id: COACH_ID }, profile: null };
    const res = await call(r.route, r.file, "POST", { body: { locale: "ar" } });
    expect(await res.json()).toEqual({ locale: "ar" });
    expect(state.tables).toEqual(["profiles"]);
    expect(state.updates).toEqual([["profiles", { locale: "ar" }]]);
    expect(state.eqs).toEqual([["id", COACH_ID]]);
  });
});
