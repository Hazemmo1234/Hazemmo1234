/**
 * Member ownership integrity (BR-P6, BR-P7, M2 decision 1 / 5): only an ACTIVE COACH
 * can own a member — on creation, reassignment and reactivation. Plus reassignment
 * history (AC-6) and coach-to-coach isolation after a reassignment (AC-3).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, COACH1, COACH2, newMember, nextPhone, service, signIn } from "./helpers";

let admin: SupabaseClient, coach1: SupabaseClient, coach2: SupabaseClient;
let inactiveCoach: string;

beforeAll(async () => {
  [admin, coach1, coach2] = await Promise.all([
    signIn("admin@gym-arena.local"), signIn("coach1@gym-arena.local"), signIn("coach2@gym-arena.local"),
  ]);
  // a deactivated coach with no clients
  const u = await service.auth.admin.createUser({ email: `inactive${Date.now()}@gym-arena.local`, password: "Probe-password-1!", email_confirm: true });
  inactiveCoach = u.data.user!.id;
  expect((await admin.from("profiles").insert({ id: inactiveCoach, full_name: "Inactive Coach", role: "coach" })).error).toBeNull();
  expect((await admin.from("profiles").update({ is_active: false }).eq("id", inactiveCoach)).error).toBeNull();
});

describe("active-coach guard", () => {
  it("creation: an admin account or an inactive coach cannot own a member", async () => {
    for (const coachId of [ADMIN, inactiveCoach]) {
      const r = await admin.from("members").insert({ full_name: "Guard", phone: nextPhone(), coach_id: coachId });
      expect(r.error?.message, coachId).toMatch(/COACH_NOT_ACTIVE/);
    }
    const ok = await admin.from("members").insert({ full_name: "Guard OK", phone: nextPhone(), coach_id: COACH1 }).select("coach_id").single();
    expect(ok.data?.coach_id).toBe(COACH1);
  });

  it("reassignment: only to an active coach; history untouched by a rejected move", async () => {
    const m = await newMember(admin, COACH1);
    for (const coachId of [ADMIN, inactiveCoach]) {
      const r = await admin.from("members").update({ coach_id: coachId }).eq("id", m.id);
      expect(r.error?.message, coachId).toMatch(/COACH_NOT_ACTIVE/);
    }
    const { data: history } = await admin.from("coach_assignments").select("coach_id, ended_at").eq("member_id", m.id);
    expect(history).toEqual([{ coach_id: COACH1, ended_at: null }]);
  });

  it("reactivation: requires an active coach — the old one if still active, otherwise a new one in the same change", async () => {
    // a member parked (inactive) with a coach who is later deactivated
    const tempCoach = (await service.auth.admin.createUser({ email: `temp${Date.now()}@gym-arena.local`, password: "Probe-password-1!", email_confirm: true })).data.user!.id;
    expect((await admin.from("profiles").insert({ id: tempCoach, full_name: "Temp Coach", role: "coach" })).error).toBeNull();
    const m = await newMember(admin, tempCoach);
    expect((await admin.from("members").update({ status: "inactive" }).eq("id", m.id)).error).toBeNull();
    expect((await admin.from("profiles").update({ is_active: false }).eq("id", tempCoach)).error).toBeNull(); // no active clients now

    const alone = await admin.from("members").update({ status: "active" }).eq("id", m.id);
    expect(alone.error?.message).toMatch(/COACH_NOT_ACTIVE/);
    const withCoach = await admin.from("members").update({ status: "active", coach_id: COACH2 }).eq("id", m.id).select("status, coach_id").single();
    expect(withCoach.data).toEqual({ status: "active", coach_id: COACH2 });
    const { data: audit } = await admin.from("audit_log").select("action").eq("entity_id", m.id);
    expect(audit!.map((a) => a.action)).toEqual(expect.arrayContaining(["member.deactivate", "member.activate", "member.reassign"]));
  });

  it("an inactive member keeps its (now inactive) coach until reactivated — history is not rewritten", async () => {
    const tempCoach = (await service.auth.admin.createUser({ email: `keep${Date.now()}@gym-arena.local`, password: "Probe-password-1!", email_confirm: true })).data.user!.id;
    expect((await admin.from("profiles").insert({ id: tempCoach, full_name: "Keep Coach", role: "coach" })).error).toBeNull();
    const m = await newMember(admin, tempCoach);
    await admin.from("members").update({ status: "inactive" }).eq("id", m.id);
    expect((await admin.from("profiles").update({ is_active: false }).eq("id", tempCoach)).error).toBeNull();
    // editing other fields of the inactive member is still allowed
    expect((await admin.from("members").update({ full_name: "Renamed while parked" }).eq("id", m.id)).error).toBeNull();
  });
});

describe("reassignment integrity (AC-3, AC-6)", () => {
  it("old coach loses access, new coach gains it; entries keep logged_by; one open assignment", async () => {
    const m = await newMember(coach1);
    const { data: entry } = await service.rpc("server_log_entry", { p_actor: COACH1, p_member_id: m.id, p_category: "pushups", p_reps: 12 });
    expect((await admin.from("members").update({ coach_id: COACH2 }).eq("id", m.id)).error).toBeNull();

    expect((await coach1.from("members").select("id").eq("id", m.id)).data).toHaveLength(0);
    expect((await coach2.from("members").select("id").eq("id", m.id)).data).toHaveLength(1);
    expect((await coach1.from("members").update({ full_name: "x" }).eq("id", m.id).select()).data ?? []).toHaveLength(0);

    const { data: kept } = await admin.from("entries").select("logged_by").eq("id", entry.id).single();
    expect(kept!.logged_by).toBe(COACH1);
    const { data: history } = await admin.from("coach_assignments").select("coach_id, ended_at").eq("member_id", m.id).order("started_at");
    expect(history!.map((h) => h.coach_id)).toEqual([COACH1, COACH2]);
    expect(history!.filter((h) => h.ended_at === null)).toHaveLength(1);
  });
});
