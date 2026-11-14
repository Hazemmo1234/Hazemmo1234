/**
 * Database / RLS tests (docs/TEST_PLAN.md "RLS tests", ACCEPTANCE_CRITERIA).
 * Requires the local stack seeded fresh: `npx supabase start && npm run db:reset`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, today } from "@/lib/time";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "Password123!";
const COACH1 = "00000000-0000-4000-a000-000000000011";
const COACH2 = "00000000-0000-4000-a000-000000000012";
const PAST_SEASON = "00000000-0000-4000-b000-000000000001";
const MEMBER_OF_COACH2 = "00000000-0000-4000-c000-000000000001"; // i=1 → coach2
const INACTIVE_MEMBER = "00000000-0000-4000-c000-000000000039";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = () => createClient(URL, ANON, opts);
const service = createClient(URL, SERVICE, opts);

async function signIn(email: string): Promise<SupabaseClient> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

let admin: SupabaseClient;
let coach1: SupabaseClient;
let coach2: SupabaseClient;
let phoneSeq = 0;
const nextPhone = () => `+2011${String(90000000 + Date.now() % 1_000_000 + ++phoneSeq).slice(-8)}`;

async function newMember(client: SupabaseClient, coachId?: string) {
  const { data, error } = await client
    .from("members")
    .insert({ full_name: `Test ${phoneSeq}`, phone: nextPhone(), photo_consent: false, coach_id: coachId ?? COACH1 })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; member_code: string; coach_id: string };
}

beforeAll(async () => {
  [admin, coach1, coach2] = await Promise.all([
    signIn("admin@gym-arena.local"),
    signIn("coach1@gym-arena.local"),
    signIn("coach2@gym-arena.local"),
  ]);
});

describe("anonymous access", () => {
  it("cannot read any table", async () => {
    for (const table of ["members", "entries", "attendance", "seasons", "profiles", "app_settings", "audit_log", "season_results"]) {
      const { data } = await anon().from(table).select("*").limit(1);
      expect(data ?? [], table).toHaveLength(0);
    }
  });
});

describe("members (AC-3, AC-4, AC-5)", () => {
  it("coach sees only own members", async () => {
    const { data } = await coach1.from("members").select("coach_id");
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((m) => m.coach_id))).toEqual(new Set([COACH1]));
    const { data: other } = await coach1.from("members").select("id").eq("id", MEMBER_OF_COACH2);
    expect(other).toHaveLength(0);
  });

  it("AC-4: member_code is the next sequential GA-XXXXXX", async () => {
    const a = await newMember(admin, COACH1);
    const b = await newMember(admin, COACH1);
    expect(a.member_code).toMatch(/^GA-\d{6}$/);
    expect(Number(b.member_code.slice(3))).toBe(Number(a.member_code.slice(3)) + 1);
  });

  it("AC-5: coach-created member belongs to the coach regardless of payload", async () => {
    const m = await newMember(coach1, COACH2);
    expect(m.coach_id).toBe(COACH1);
  });

  it("coach cannot change coach_id or status", async () => {
    const m = await newMember(coach1);
    const r1 = await coach1.from("members").update({ coach_id: COACH2 }).eq("id", m.id);
    expect(r1.error?.message).toMatch(/FORBIDDEN/);
    const r2 = await coach1.from("members").update({ status: "inactive" }).eq("id", m.id);
    expect(r2.error?.message).toMatch(/FORBIDDEN/);
  });

  it("coach cannot update another coach's member", async () => {
    const { data } = await coach1.from("members").update({ full_name: "Hacked" }).eq("id", MEMBER_OF_COACH2).select();
    expect(data ?? []).toHaveLength(0);
  });

  it("AC-6: admin reassign closes old assignment, opens new one, writes audit", async () => {
    const m = await newMember(admin, COACH1);
    const { error } = await admin.from("members").update({ coach_id: COACH2 }).eq("id", m.id);
    expect(error).toBeNull();
    const { data: rows } = await admin.from("coach_assignments").select("coach_id, ended_at").eq("member_id", m.id);
    expect(rows).toHaveLength(2);
    expect(rows!.filter((r) => r.ended_at === null).map((r) => r.coach_id)).toEqual([COACH2]);
    const { data: audit } = await admin.from("audit_log").select("action").eq("entity_id", m.id);
    expect(audit!.map((a) => a.action)).toContain("member.reassign");
  });

  it("rejects non-Egyptian phone numbers (D12)", async () => {
    const { error } = await admin.from("members").insert({ full_name: "X", phone: "+14155550100", coach_id: COACH1 });
    expect(error).not.toBeNull();
  });
});

describe("entries (AC-8 … AC-17)", () => {
  it("AC-8: deadlift 95 × 5 stores e1RM 110.8333, server date, auto attendance (AC-15)", async () => {
    const m = await newMember(coach1);
    const { data, error } = await coach1.rpc("log_entry", {
      p_member_id: m.id, p_category: "deadlift", p_weight_kg: 95, p_reps: 5,
      p_performed_on: addDays(today(), -3), // AC-11: ignored for coaches
    });
    expect(error).toBeNull();
    expect(Number(data.value)).toBeCloseTo(110.8333, 4);
    expect(data.performed_on).toBe(today());

    await coach1.rpc("log_entry", { p_member_id: m.id, p_category: "pushups", p_reps: 20 });
    const { data: att } = await coach1.from("attendance").select("source").eq("member_id", m.id).is("voided_at", null);
    expect(att).toEqual([{ source: "auto" }]);
  });

  it("AC-9: reps = 6 for a lift is rejected", async () => {
    const m = await newMember(coach1);
    const { error } = await coach1.rpc("log_entry", { p_member_id: m.id, p_category: "squat", p_weight_kg: 80, p_reps: 6 });
    expect(error?.message).toMatch(/entries_shape/);
  });

  it("AC-10: second deadlift today → ALREADY_LOGGED_TODAY", async () => {
    const m = await newMember(coach1);
    await coach1.rpc("log_entry", { p_member_id: m.id, p_category: "deadlift", p_weight_kg: 100, p_reps: 3 });
    const { error } = await coach1.rpc("log_entry", { p_member_id: m.id, p_category: "deadlift", p_weight_kg: 102.5, p_reps: 3 });
    expect(error?.message).toMatch(/ALREADY_LOGGED_TODAY/);
  });

  it("coach cannot log for another coach's member", async () => {
    const { error } = await coach1.rpc("log_entry", { p_member_id: MEMBER_OF_COACH2, p_category: "treadmill", p_km: 3 });
    expect(error).not.toBeNull();
  });

  it("AC-7: inactive member cannot receive entries", async () => {
    const { error } = await admin.rpc("log_entry", { p_member_id: INACTIVE_MEMBER, p_category: "treadmill", p_km: 3 });
    expect(error?.message).toMatch(/MEMBER_INACTIVE/);
  });

  it("AC-16/AC-17: coach undo voids entry + auto attendance, audited; manual attendance stays", async () => {
    const m = await newMember(coach1);
    const { data: e } = await coach1.rpc("log_entry", { p_member_id: m.id, p_category: "treadmill", p_km: 4 });
    const { error } = await coach1.from("entries").update({ voided_at: new Date().toISOString(), void_reason: "undo" }).eq("id", e.id);
    expect(error).toBeNull();
    const { data: att } = await coach1.from("attendance").select("voided_at").eq("member_id", m.id);
    expect(att!.every((a) => a.voided_at !== null)).toBe(true);
    const { data: audit } = await admin.from("audit_log").select("action, actor_id").eq("entity_id", e.id);
    expect(audit).toEqual([{ action: "entry.void", actor_id: COACH1 }]);

    const m2 = await newMember(coach1);
    await coach1.from("attendance").insert({ member_id: m2.id, attended_on: today(), source: "manual", logged_by: COACH1, season_id: PAST_SEASON });
    const { data: e2 } = await coach1.rpc("log_entry", { p_member_id: m2.id, p_category: "pullups", p_reps: 5 });
    await coach1.from("entries").update({ voided_at: new Date().toISOString() }).eq("id", e2.id);
    const { data: att2 } = await coach1.from("attendance").select("source, voided_at").eq("member_id", m2.id);
    expect(att2).toEqual([{ source: "manual", voided_at: null }]);
  });

  it("AC-16: coach cannot void a past day's entry; cannot edit values", async () => {
    const { data: old } = await coach1.from("entries").select("id").lt("performed_on", today()).is("voided_at", null).limit(1);
    const { data } = await coach1.from("entries").update({ voided_at: new Date().toISOString() }).eq("id", old![0].id).select();
    expect(data ?? []).toHaveLength(0);

    const m = await newMember(coach1);
    const { data: e } = await coach1.rpc("log_entry", { p_member_id: m.id, p_category: "pushups", p_reps: 30 });
    const r = await coach1.from("entries").update({ reps: 40 }).eq("id", e.id);
    expect(r.error?.message).toMatch(/FORBIDDEN/);
  });

  it("entries are never hard-deleted (BR-E8)", async () => {
    const { data: row } = await service.from("entries").select("id").limit(1).single();
    const { error } = await service.from("entries").delete().eq("id", row!.id);
    expect(error?.message).toMatch(/DELETE_FORBIDDEN/);
  });
});

describe("seasons (AC-22, AC-23)", () => {
  it("AC-22: overlapping season fails", async () => {
    const { error } = await admin.from("seasons").insert({ name: "Overlap", type: "championship", starts_on: today(), ends_on: addDays(today(), 3) });
    expect(error?.message).toMatch(/seasons_no_overlap/);
  });

  it("coach cannot create seasons", async () => {
    const { error } = await coach1.from("seasons").insert({ name: "X", type: "championship", starts_on: "2030-01-01", ends_on: "2030-01-31" });
    expect(error).not.toBeNull();
  });

  it("AC-23: closed season data cannot be modified, even by admin", async () => {
    const { data: e } = await admin.from("entries").select("id").eq("season_id", PAST_SEASON).is("voided_at", null).limit(1).single();
    const r1 = await admin.from("entries").update({ voided_at: new Date().toISOString() }).eq("id", e!.id);
    expect(r1.error?.message).toMatch(/SEASON_CLOSED/);
    const r2 = await admin.from("seasons").update({ name: "Renamed" }).eq("id", PAST_SEASON);
    expect(r2.error?.message).toMatch(/SEASON_CLOSED/);
  });
});

describe("restricted tables", () => {
  it("coach cannot read app_settings, audit_log or other profiles", async () => {
    expect((await coach1.from("app_settings").select("*")).data ?? []).toHaveLength(0);
    expect((await coach1.from("audit_log").select("*")).data ?? []).toHaveLength(0);
    const { data: profiles } = await coach1.from("profiles").select("id");
    expect(profiles!.map((p) => p.id)).toEqual([COACH1]);
  });

  it("admin can read app_settings", async () => {
    const { data } = await admin.from("app_settings").select("gym_name").single();
    expect(data?.gym_name).toBe("DFN GYM");
  });
});

describe("storage (BR-X3)", () => {
  it("coach cannot upload evidence for another coach's member", async () => {
    const path = `entries/${PAST_SEASON}/${MEMBER_OF_COACH2}/x.webp`;
    const { error } = await coach1.storage.from("evidence").upload(path, new Blob(["x"], { type: "image/webp" }));
    expect(error).not.toBeNull();
  });

  it("coach can upload evidence for own member", async () => {
    const m = await newMember(coach1);
    const path = `entries/${PAST_SEASON}/${m.id}/x.webp`;
    const { error } = await coach1.storage.from("evidence").upload(path, new Blob(["x"], { type: "image/webp" }));
    expect(error).toBeNull();
    const other = await coach2.storage.from("evidence").download(path);
    expect(other.error).not.toBeNull();
  });
});
