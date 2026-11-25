/**
 * Server-only writes for entries and attendance (D19, BR-X4), void ownership (D26),
 * admin corrections with reasons (BR-E9, BR-E11). AC-8 … AC-17, AC-39, AC-40, AC-45 … AC-47.
 * Regression tests for audit finding S-1.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, today } from "@/lib/time";
import {
  ACTIVE_SEASON, ADMIN, COACH1, COACH2, INACTIVE_MEMBER, MEMBER_OF_COACH1, MEMBER_OF_COACH2, PAST_SEASON,
  newMember, owner, serverLog, service, signIn,
} from "./helpers";

let admin: SupabaseClient, coach1: SupabaseClient;
beforeAll(async () => {
  [admin, coach1] = await Promise.all([signIn("admin@gym-arena.local"), signIn("coach1@gym-arena.local")]);
});

const voidEntry = (actor: string, id: string, reason?: string) =>
  service.rpc("server_void_entry", { p_actor: actor, p_entry_id: id, p_reason: reason ?? null });

describe("S-1 regression: clients cannot write entries or attendance directly (AC-39)", () => {
  it("direct table insert by a coach is denied", async () => {
    const r = await coach1.from("entries").insert({
      member_id: MEMBER_OF_COACH1, category: "deadlift", weight_kg: 300, reps: 5, value: 0,
      performed_on: today(), logged_by: COACH1, season_id: ACTIVE_SEASON,
    });
    expect(r.error?.message).toMatch(/permission denied for table entries/);
    const a = await coach1.from("attendance").insert({
      member_id: MEMBER_OF_COACH1, attended_on: today(), source: "manual", logged_by: COACH1, season_id: ACTIVE_SEASON,
    });
    expect(a.error?.message).toMatch(/permission denied for table attendance/);
  });

  it("direct update (void/edit) by coach or admin is denied", async () => {
    const m = await newMember(coach1);
    const { data: e } = await serverLog(COACH1, m.id, "pushups", { p_reps: 20 });
    for (const client of [coach1, admin]) {
      const r = await client.from("entries").update({ voided_at: new Date().toISOString() }).eq("id", e.id);
      expect(r.error?.message).toMatch(/permission denied for table entries/);
    }
  });

  it("server functions are not callable with a staff session, and the old log_entry is gone", async () => {
    for (const client of [coach1, admin]) {
      const r = await client.rpc("server_log_entry", { p_actor: ADMIN, p_member_id: MEMBER_OF_COACH1, p_category: "treadmill", p_km: 3 });
      expect(r.error?.message).toMatch(/permission denied for function server_log_entry/);
      const v = await client.rpc("server_void_entry", { p_actor: ADMIN, p_entry_id: MEMBER_OF_COACH1 });
      expect(v.error?.message).toMatch(/permission denied/);
    }
    const old = await coach1.rpc("log_entry", { p_member_id: MEMBER_OF_COACH1, p_category: "treadmill", p_km: 3 });
    expect(old.error).not.toBeNull();
  });
});

describe("server_log_entry applies the acting user's rules (BR-E1 … BR-E5)", () => {
  it("AC-8/AC-11/AC-15/AC-40: value, server date, logged_by = actor, one auto attendance", async () => {
    const m = await newMember(coach1);
    const { data, error } = await serverLog(COACH1, m.id, "deadlift", {
      p_weight_kg: 95, p_reps: 5, p_performed_on: addDays(today(), -3), // ignored for coaches
    });
    expect(error).toBeNull();
    expect(Number(data.value)).toBeCloseTo(110.8333, 4);
    expect(data.performed_on).toBe(today());
    expect(data.logged_by).toBe(COACH1);
    await serverLog(COACH1, m.id, "pushups", { p_reps: 20 });
    const { data: att } = await admin.from("attendance").select("source").eq("member_id", m.id).is("voided_at", null);
    expect(att).toEqual([{ source: "auto" }]);
  });

  it("coach cannot log for another coach's member; unknown or missing actor is refused", async () => {
    expect((await serverLog(COACH1, MEMBER_OF_COACH2, "treadmill", { p_km: 3 })).error?.message).toMatch(/FORBIDDEN: not your client/);
    expect((await serverLog("00000000-0000-4000-a000-0000000000ff", MEMBER_OF_COACH1, "treadmill", { p_km: 3 })).error?.message)
      .toMatch(/not an active staff account/);
    const none = await service.rpc("server_log_entry", { p_actor: null, p_member_id: MEMBER_OF_COACH1, p_category: "treadmill", p_km: 3 });
    expect(none.error?.message).toMatch(/not an active staff account/);
  });

  it("AC-9 / AC-10 / AC-7: reps 6 rejected; duplicate → ALREADY_LOGGED_TODAY; inactive member refused", async () => {
    const m = await newMember(coach1);
    expect((await serverLog(COACH1, m.id, "squat", { p_weight_kg: 80, p_reps: 6 })).error?.message).toMatch(/entries_shape/);
    await serverLog(COACH1, m.id, "deadlift", { p_weight_kg: 100, p_reps: 3 });
    expect((await serverLog(COACH1, m.id, "deadlift", { p_weight_kg: 102.5, p_reps: 3 })).error?.message).toMatch(/ALREADY_LOGGED_TODAY/);
    expect((await serverLog(ADMIN, INACTIVE_MEMBER, "treadmill", { p_km: 3 })).error?.message).toMatch(/MEMBER_INACTIVE/);
  });

  it("BR-E2 under concurrency: 6 identical submissions → exactly one entry and one attendance", async () => {
    const m = await newMember(coach1);
    const results = await Promise.all(Array.from({ length: 6 }, () => serverLog(COACH1, m.id, "pullups", { p_reps: 8 })));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => /ALREADY_LOGGED_TODAY/.test(r.error?.message ?? ""))).toHaveLength(5);
    const { data: att } = await admin.from("attendance").select("id").eq("member_id", m.id);
    expect(att).toHaveLength(1);
  });

  it("D7: admin may backdate within the active season, not into the future or outside it", async () => {
    const m = await newMember(admin);
    const ok = await serverLog(ADMIN, m.id, "treadmill", { p_km: 4, p_performed_on: addDays(today(), -2) });
    expect(ok.data?.performed_on).toBe(addDays(today(), -2));
    expect(ok.data?.logged_by).toBe(ADMIN);
    expect((await serverLog(ADMIN, m.id, "pushups", { p_reps: 5, p_performed_on: addDays(today(), 1) })).error?.message).toMatch(/NO_ACTIVE_SEASON/);
    expect((await serverLog(ADMIN, m.id, "pushups", { p_reps: 5, p_performed_on: addDays(today(), -40) })).error?.message).toMatch(/NO_ACTIVE_SEASON/);
  });

  it("evidence path must be this member's folder for this season (S-1 / BR-X3)", async () => {
    const m = await newMember(coach1);
    const stolen = await serverLog(COACH1, m.id, "bench", { p_weight_kg: 60, p_reps: 5, p_photo_path: `entries/${ACTIVE_SEASON}/${MEMBER_OF_COACH2}/x.webp` });
    expect(stolen.error?.message).toMatch(/photo_path is not in this member's evidence folder/);
    const wrongSeason = await serverLog(COACH1, m.id, "bench", { p_weight_kg: 60, p_reps: 5, p_photo_path: `entries/${PAST_SEASON}/${m.id}/x.webp` });
    expect(wrongSeason.error?.message).toMatch(/photo_path/);
    const ok = await serverLog(COACH1, m.id, "bench", { p_weight_kg: 60, p_reps: 5, p_photo_path: `entries/${ACTIVE_SEASON}/${m.id}/x.webp` });
    expect(ok.error).toBeNull();
  });
});

describe("attendance (BR-E7, BR-E2)", () => {
  it("manual attendance via the server; duplicates and other coaches' members are refused", async () => {
    const m = await newMember(coach1);
    const a = await service.rpc("server_log_attendance", { p_actor: COACH1, p_member_id: m.id, p_attended_on: addDays(today(), -5) });
    expect(a.data).toMatchObject({ source: "manual", attended_on: today(), logged_by: COACH1 });
    expect((await service.rpc("server_log_attendance", { p_actor: COACH1, p_member_id: m.id })).error?.message).toMatch(/ALREADY_LOGGED_TODAY/);
    expect((await service.rpc("server_log_attendance", { p_actor: COACH1, p_member_id: MEMBER_OF_COACH2 })).error?.message).toMatch(/FORBIDDEN/);
  });
});

describe("void and undo (BR-E9, BR-E10, D26)", () => {
  it("AC-16/AC-17: coach undo voids entry + auto attendance, audited with the coach as actor", async () => {
    const m = await newMember(coach1);
    const { data: e } = await serverLog(COACH1, m.id, "treadmill", { p_km: 4 });
    const v = await voidEntry(COACH1, e.id);
    expect(v.error).toBeNull();
    expect(v.data).toMatchObject({ voided_by: COACH1 });
    const { data: att } = await admin.from("attendance").select("voided_at").eq("member_id", m.id);
    expect(att!.every((a) => a.voided_at !== null)).toBe(true);
    const { data: audit } = await admin.from("audit_log").select("action, actor_id").eq("entity_id", e.id);
    expect(audit).toEqual([{ action: "entry.void", actor_id: COACH1 }]);
    // voided entries are final
    expect((await voidEntry(ADMIN, e.id, "again")).error?.message).toMatch(/voided entries cannot change/);
  });

  it("AC-17: manual attendance stays when the only entry is voided", async () => {
    const m = await newMember(coach1);
    await service.rpc("server_log_attendance", { p_actor: COACH1, p_member_id: m.id });
    const { data: e } = await serverLog(COACH1, m.id, "pullups", { p_reps: 5 });
    await voidEntry(COACH1, e.id);
    const { data: att } = await admin.from("attendance").select("source, voided_at").eq("member_id", m.id);
    expect(att).toEqual([{ source: "manual", voided_at: null }]);
  });

  it("AC-16: a past day's entry → VOID_WINDOW_PASSED for the coach who submitted it", async () => {
    const { data: old } = await admin.from("entries").select("id")
      .eq("logged_by", COACH1).eq("season_id", ACTIVE_SEASON).lt("performed_on", today()).is("voided_at", null).limit(1);
    expect((await voidEntry(COACH1, old![0].id)).error?.message).toMatch(/VOID_WINDOW_PASSED/);
  });

  it("AC-45: after reassignment the new coach cannot void the previous coach's entry; the submitter still can", async () => {
    const m = await newMember(coach1);
    const { data: e } = await serverLog(COACH1, m.id, "pushups", { p_reps: 30 });
    expect((await admin.from("members").update({ coach_id: COACH2 }).eq("id", m.id)).error).toBeNull();
    expect((await voidEntry(COACH2, e.id)).error?.message).toMatch(/only the coach who submitted an entry can void it/);
    const stillThere = await admin.from("entries").select("voided_at, logged_by").eq("id", e.id).single();
    expect(stillThere.data).toEqual({ voided_at: null, logged_by: COACH1 });
    expect((await voidEntry(COACH1, e.id)).error).toBeNull();
    // and the new coach can log for the member (journey 4)
    expect((await serverLog(COACH2, m.id, "treadmill", { p_km: 2 })).error).toBeNull();
    expect((await serverLog(COACH1, m.id, "squat", { p_weight_kg: 50, p_reps: 5 })).error?.message).toMatch(/not your client/);
  });

  it("AC-46: a coach cannot void an entry the Admin submitted for their member", async () => {
    const m = await newMember(coach1);
    const { data: e } = await serverLog(ADMIN, m.id, "treadmill", { p_km: 5 });
    expect((await voidEntry(COACH1, e.id)).error?.message).toMatch(/only the coach who submitted/);
  });
});

describe("admin corrections need a reason and are audited (AC-47, BR-E11)", () => {
  it("void: rejected without a reason; with one, the audit row carries actor and reason", async () => {
    const m = await newMember(coach1);
    const { data: e } = await serverLog(COACH1, m.id, "treadmill", { p_km: 6 });
    for (const reason of [undefined, "", "   "]) {
      expect((await voidEntry(ADMIN, e.id, reason)).error?.message).toMatch(/a reason is required/);
    }
    expect((await admin.from("entries").select("voided_at").eq("id", e.id).single()).data?.voided_at).toBeNull();
    expect((await voidEntry(ADMIN, e.id, "typo: logged twice")).error).toBeNull();
    const { data: audit } = await admin.from("audit_log").select("action, actor_id, reason").eq("entity_id", e.id);
    expect(audit).toEqual([{ action: "entry.void", actor_id: ADMIN, reason: "typo: logged twice" }]);
  });

  it("edit: rejected without a reason; with one, value is recomputed and audited; coaches cannot edit", async () => {
    const m = await newMember(coach1);
    const { data: e } = await serverLog(COACH1, m.id, "deadlift", { p_weight_kg: 100, p_reps: 5 });
    const edit = (actor: string, reason: string | null) =>
      service.rpc("server_edit_entry", { p_actor: actor, p_entry_id: e.id, p_reason: reason, p_weight_kg: 90 });
    expect((await edit(ADMIN, null)).error?.message).toMatch(/a reason is required/);
    expect((await edit(COACH1, "fix")).error?.message).toMatch(/coaches can only void/);
    const ok = await edit(ADMIN, "wrong plate count");
    expect(Number(ok.data.value)).toBeCloseTo(105, 4);
    expect(ok.data.logged_by).toBe(COACH1);
    const { data: audit } = await admin.from("audit_log").select("action, actor_id, reason, before, after").eq("entity_id", e.id);
    expect(audit).toHaveLength(1);
    expect(audit![0]).toMatchObject({ action: "entry.edit", actor_id: ADMIN, reason: "wrong plate count" });
    expect(Number(audit![0].before.weight_kg)).toBe(100);
    expect(Number(audit![0].after.weight_kg)).toBe(90);
  });
});

describe("history is protected (BR-E8, BR-S7, S-3 regression)", () => {
  it("entries are never hard-deleted, by any role", async () => {
    const { data: row } = await service.from("entries").select("id").limit(1).single();
    expect((await service.from("entries").delete().eq("id", row!.id)).error?.message).toMatch(/DELETE_FORBIDDEN/);
  });

  it("S-3 / AC-41: an entry's season can never be changed — even by the database owner", async () => {
    const o = owner();
    await expect(o`
      update public.entries set season_id = ${PAST_SEASON}
      where id = (select id from public.entries where season_id = ${ACTIVE_SEASON} and voided_at is null limit 1)`,
    ).rejects.toThrow(/immutable entry fields/);
    await o.end();
  });

  it("AC-23: closed-season entries cannot be voided or edited", async () => {
    const { data: e } = await admin.from("entries").select("id").eq("season_id", PAST_SEASON).is("voided_at", null).limit(1).single();
    expect((await voidEntry(ADMIN, e!.id, "late fix")).error?.message).toMatch(/SEASON_CLOSED/);
    const edit = await service.rpc("server_edit_entry", { p_actor: ADMIN, p_entry_id: e!.id, p_reason: "late fix", p_reps: 4 });
    expect(edit.error?.message).toMatch(/SEASON_CLOSED/);
  });
});
