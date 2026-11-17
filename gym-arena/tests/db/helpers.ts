/**
 * Shared helpers for database tests. These tests run ONLY against a local, disposable Supabase
 * stack that has been positively verified (never the protected gym-arena-test stack).
 *
 * This module is the ONLY place in tests/db that creates database or Supabase clients
 * (enforced by tests/unit/e2e-import-graph.test.ts). Every client below is created only AFTER
 * the three checks at the top of this module have passed, so a test file — whose own code
 * runs only after its imports have finished evaluating — can never reach a database before
 * the identity check completes, whatever runner configuration was used.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { verifyWriteTarget } from "../support/stack-identity";
import { resolveWriteTarget } from "../support/write-target";

// The database suite creates rows (members, seasons, entries, audit rows) on every run and
// rows can never be deleted (BR-E8). It therefore runs only on a database explicitly marked
// as disposable (TEST_DB_ISOLATED=1).
// 1. explicit opt-in
if (process.env.TEST_DB_ISOLATED !== "1") {
  throw new Error(
    "Database tests refuse to run without TEST_DB_ISOLATED=1. They create permanent rows; " +
      "never point them at the development database.",
  );
}

// 2. declared profile + URLs (fail closed — tests/support/write-target.ts): refuses the
//    protected stack by name and by port, unknown profiles, non-local hosts.
resolveWriteTarget(process.env);

// 3. the ACTUAL stack (tests/support/stack-identity.ts): containers, project label, ports,
//    volume, and the database reached through TEST_DATABASE_URL is the one in that container.
//    Awaited here, at module level, so it runs even if a different runner configuration
//    skipped the global setup. Any failure (missing identity, mismatch, connection error,
//    timeout) rejects this module and no client below is ever created.
await verifyWriteTarget(process.env);

// Read only after the checks above have passed.
export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const DB_URL = process.env.TEST_DATABASE_URL ?? "";

export const PASSWORD = "Password123!";
export const ADMIN = "00000000-0000-4000-a000-000000000001";
export const COACH1 = "00000000-0000-4000-a000-000000000011";
export const COACH2 = "00000000-0000-4000-a000-000000000012";
export const PAST_SEASON = "00000000-0000-4000-b000-000000000001";
export const ACTIVE_SEASON = "00000000-0000-4000-b000-000000000002";
export const MEMBER_OF_COACH1 = "00000000-0000-4000-c000-000000000003"; // seed i=3 → coach1
export const MEMBER_OF_COACH2 = "00000000-0000-4000-c000-000000000001"; // seed i=1 → coach2
export const INACTIVE_MEMBER = "00000000-0000-4000-c000-000000000039";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const anon = () => createClient(URL, ANON, opts);
/** Service-role client = what the Next.js server uses. */
export const service = createClient(URL, SERVICE, opts);

export async function signIn(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Owner connection (migrations/seed level) — for test fixtures only. */
export const owner = () => postgres(DB_URL, { max: 1, onnotice: () => {} });

const CLOSER_PASSWORD = "local-test-closer";
/** Connection as the restricted season-close role (D27). Login is enabled for local tests only. */
export async function closerConnection(max = 1) {
  const o = owner();
  await o.unsafe(`alter role arena_season_closer login password '${CLOSER_PASSWORD}'`);
  await o.end();
  const u = new globalThis.URL(DB_URL);
  u.username = "arena_season_closer";
  u.password = CLOSER_PASSWORD;
  return postgres(u.toString(), { max, onnotice: () => {} });
}

let seq = 0;
const run = Math.floor(Math.random() * 9000) + 1000;
export const nextPhone = () => `+2011${run}${String(++seq).padStart(4, "0")}`;

export interface TestMember {
  id: string;
  member_code: string;
  coach_id: string;
}
export async function newMember(client: SupabaseClient, coachId: string = COACH1): Promise<TestMember> {
  const { data, error } = await client
    .from("members")
    .insert({ full_name: `Test ${run}-${seq}`, phone: nextPhone(), photo_consent: false, coach_id: coachId })
    .select()
    .single();
  if (error) throw error;
  return data as TestMember;
}

/** Calls a server-only function the way the server does: service role + verified actor. */
export function serverLog(actor: string, member: string, category: string, fields: Record<string, unknown> = {}) {
  return service.rpc("server_log_entry", { p_actor: actor, p_member_id: member, p_category: category, ...fields });
}

/** An ended, unclosed season far in the past with all active members as participants. */
export async function endedSeason(type: "championship" | "preseason") {
  const o = owner();
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const year = 1900 + Math.floor(Math.random() * 110);
      const month = `${year}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}`;
      try {
        const [row] = await o`
          insert into public.seasons (name, type, starts_on, ends_on)
          values (${`Test ${type} ${month}`}, ${type}, ${`${month}-01`}::date, (${`${month}-01`}::date + 27))
          returning id, starts_on::text as starts_on`;
        const participants = await o`
          select sp.member_id from public.season_participants sp where sp.season_id = ${row.id}`;
        return { id: row.id as string, startsOn: row.starts_on as string, participants: participants.map((p) => p.member_id as string) };
      } catch (e) {
        if (!String(e).includes("seasons_no_overlap")) throw e;
      }
    }
    throw new Error("could not find a free month for a test season");
  } finally {
    await o.end();
  }
}

export function fakeResults(memberIds: string[]) {
  return memberIds.map((member_id, i) => ({
    member_id, is_rookie: false, deadlift: 10, bench: 10, squat: 10, pullups: 30, pushups: 30,
    treadmill: 40, consistency: 50, improvement_points: 90, total: 180, rank: i + 1, rookie_rank: null,
  }));
}

/**
 * An inactive coach account (tests/FIXTURES.md), created once per stack and reused: proves an
 * inactive coach reads nothing. Signed-in client returned.
 */
export async function inactiveProbeCoach(): Promise<SupabaseClient> {
  const email = "policy-inactive@gym-arena.local";
  const password = "Probe-password-1!";
  const o = owner();
  let [u] = await o`select id from auth.users where email = ${email}`;
  await o.end();
  if (!u) {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    u = { id: created.data.user!.id };
    const admin = await signIn("admin@gym-arena.local");
    const ins = await admin.from("profiles").insert({ id: u.id, full_name: "Policy Inactive Coach", role: "coach" });
    if (ins.error) throw ins.error;
    const off = await admin.from("profiles").update({ is_active: false }).eq("id", u.id);
    if (off.error) throw off.error;
  }
  return signIn(email, password);
}
