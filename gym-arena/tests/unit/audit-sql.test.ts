import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Audit records can never hold a credential or the TV key (SECURITY_SPECIFICATION, BR-X2/D3).
// The only write path is public.audit(), called from triggers (security definer); no API role
// may call it or insert into audit_log. The DB suite proves the grants at runtime; this guards
// the migrations themselves, so a new trigger cannot start logging whole settings/profile rows.
const DIR = join(__dirname, "..", "..", "supabase", "migrations");
const sql = readdirSync(DIR).sort().map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");
const calls = [...sql.matchAll(/perform public\.audit\(([\s\S]*?)\);/g)].map((m) => m[1]!);

describe("audit write paths", () => {
  it("finds the audit calls", () => {
    expect(calls.length).toBeGreaterThanOrEqual(12);
  });

  it("never logs the TV key, and never logs a whole settings or profile row", () => {
    for (const c of calls) {
      expect(c, c).not.toMatch(/tv_key\s*[,)]|'tv_key'\s*,\s*(new|old)\./);
      if (/'(app_settings|profile)'/.test(c)) expect(c, c).not.toMatch(/to_jsonb\((new|old)\)/);
    }
    const rotation = calls.find((c) => c.startsWith("'tv_key.regenerate'"))!;
    expect(rotation.replace(/\s+/g, " ")).toBe("'tv_key.regenerate', 'app_settings', null, null, null");
  });

  it("no API role can call audit() or write audit_log directly", () => {
    expect(sql).toMatch(/revoke execute on all functions in schema public from public, anon, authenticated, service_role;/);
    const grants = [...sql.matchAll(/grant execute on function([\s\S]*?) to [^;]+;/g)].map((m) => m[1]!);
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) expect(g).not.toMatch(/public\.audit\(/);
    expect(sql).toMatch(/revoke insert, update on public\.season_results, public\.daily_rank_snapshots, public\.audit_log,/);
    // the app itself only ever reads audit_log (src/modules/audit/service.ts)
    const src = join(__dirname, "..", "..", "src");
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f));
    const writers = files.filter((f) => /from\("audit_log"\)\s*\.(insert|update|upsert|delete)/.test(readFileSync(join(src, f), "utf8")));
    expect(writers).toEqual([]);
  });
});
