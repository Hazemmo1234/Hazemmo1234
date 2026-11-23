import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// SECURITY_SPECIFICATION: every API handler authenticates the caller from the verified session
// before doing anything; only three endpoints are public, each with its own check. The
// middleware also refuses unauthenticated /api calls, but a route must not rely on it alone.
// This fails when a new route ships without a guard, or a public route loses its check.
const API = join(__dirname, "..", "..", "src", "app", "api");

const STAFF_GUARDS = /\b(requireRole|requireStaff|staffOr401|getCurrentProfile)\(/;
const PUBLIC: Record<string, RegExp> = {
  "tv/state/route.ts": /tvKeyMatches\(/, // TV key, constant-time (D3)
  "cron/snapshot/route.ts": /if \(!authorized\(request\)\) return apiError\("UNAUTHENTICATED"/, // CRON_SECRET
  // validated locale only; updates the session user's own profile row (RLS) and the cookie
  "locale/route.ts": /z\.enum\(LOCALES\)[\s\S]*auth\.getUser\(\)[\s\S]*\.eq\("id", user\.id\)/,
};

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routes(p) : name === "route.ts" ? [p] : [];
  });
}

describe("API route guards", () => {
  const files = routes(API).map((f) => relative(API, f).split("\\").join("/"));

  it("finds the API routes", () => {
    expect(files.length).toBeGreaterThanOrEqual(28);
  });

  it("every non-public route authenticates the caller", () => {
    const unguarded = files.filter((f) => !(f in PUBLIC) && !STAFF_GUARDS.test(readFileSync(join(API, f), "utf8")));
    expect(unguarded).toEqual([]);
  });

  it("every public route keeps its own check", () => {
    for (const [file, check] of Object.entries(PUBLIC)) {
      expect(files, file).toContain(file);
      expect(check.test(readFileSync(join(API, file), "utf8")), file).toBe(true);
    }
  });

  it("the service-role client is only used behind server-only code", () => {
    const service = readFileSync(join(API, "..", "..", "lib", "supabase", "service.ts"), "utf8");
    expect(service).toContain('import "server-only"');
  });
});
