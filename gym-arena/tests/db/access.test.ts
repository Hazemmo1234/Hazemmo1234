/**
 * Read isolation, members, profiles and role boundaries
 * (TEST_PLAN "RLS tests"; AC-1, AC-3 … AC-7; SECURITY_SPECIFICATION §2, §5).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN, COACH1, COACH2, MEMBER_OF_COACH2, PAST_SEASON, anon, newMember, nextPhone, owner, serverLog, service, signIn,
} from "./helpers";

let admin: SupabaseClient, coach1: SupabaseClient;
beforeAll(async () => {
  [admin, coach1] = await Promise.all([signIn("admin@gym-arena.local"), signIn("coach1@gym-arena.local")]);
});

describe("anonymous access", () => {
  it("cannot read any table (no rows AND an explicit permission error)", async () => {
    for (const table of ["members", "entries", "attendance", "seasons", "profiles", "app_settings", "audit_log", "season_results", "season_participants"]) {
      const { data, error } = await anon().from(table).select("*").limit(1);
      expect(data, table).toBeNull();
      expect(error?.message, table).toMatch(/permission denied/);
    }
  });

  it("cannot execute any database function", async () => {
    for (const fn of ["is_admin", "current_actor", "app_today"]) {
      const { error } = await anon().rpc(fn);
      expect(error?.message, fn).toMatch(/permission denied/);
    }
  });
});

describe("members (AC-3 … AC-7)", () => {
  it("coach sees only own members", async () => {
    const { data } = await coach1.from("members").select("coach_id");
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((m) => m.coach_id))).toEqual(new Set([COACH1]));
    const { data: other } = await coach1.from("members").select("id").eq("id", MEMBER_OF_COACH2);
    expect(other).toHaveLength(0);
  });

  it("AC-4: member_code is the next sequential GA-XXXXXX", async () => {
    const a = await newMember(admin);
    const b = await newMember(admin);
    expect(a.member_code).toMatch(/^GA-\d{6}$/);
    expect(Number(b.member_code.slice(3))).toBe(Number(a.member_code.slice(3)) + 1);
  });

  it("AC-5: coach-created member belongs to the coach regardless of payload", async () => {
    const m = await newMember(coach1, COACH2);
    expect(m.coach_id).toBe(COACH1);
  });

  it("coach cannot change coach_id, status or join date; nobody can rewrite the creation record", async () => {
    const m = await newMember(coach1);
    for (const patch of [{ coach_id: COACH2 }, { status: "inactive" }, { joined_on: "2020-01-01" }, { created_by: COACH2 }]) {
      const r = await coach1.from("members").update(patch).eq("id", m.id);
      expect(r.error?.message, JSON.stringify(patch)).toMatch(/FORBIDDEN/);
    }
    const r = await admin.from("members").update({ created_by: COACH2 }).eq("id", m.id);
    expect(r.error?.message).toMatch(/FORBIDDEN/);
  });

  it("coach cannot update another coach's member", async () => {
    const { data } = await coach1.from("members").update({ full_name: "Hacked" }).eq("id", MEMBER_OF_COACH2).select();
    expect(data ?? []).toHaveLength(0);
  });

  it("AC-6: admin reassign closes old assignment, opens new one, writes audit", async () => {
    const m = await newMember(admin);
    const { error } = await admin.from("members").update({ coach_id: COACH2 }).eq("id", m.id);
    expect(error).toBeNull();
    const { data: rows } = await admin.from("coach_assignments").select("coach_id, ended_at").eq("member_id", m.id);
    expect(rows).toHaveLength(2);
    expect(rows!.filter((r) => r.ended_at === null).map((r) => r.coach_id)).toEqual([COACH2]);
    const { data: audit } = await admin.from("audit_log").select("action, actor_id").eq("entity_id", m.id);
    expect(audit).toContainEqual({ action: "member.reassign", actor_id: ADMIN });
  });

  it("rejects non-Egyptian phone numbers (D12) and photo paths outside the member's folder", async () => {
    const r1 = await admin.from("members").insert({ full_name: "X", phone: "+14155550100", coach_id: COACH1 });
    expect(r1.error).not.toBeNull();
    const m = await newMember(coach1);
    const r2 = await coach1.from("members").update({ photo_path: `members/${MEMBER_OF_COACH2}/x.webp` }).eq("id", m.id);
    expect(r2.error?.message).toMatch(/check constraint/);
    const r3 = await coach1.from("members").update({ photo_path: `members/${m.id}/x.webp` }).eq("id", m.id);
    expect(r3.error).toBeNull();
  });
});

describe("service role is a transport, not an authority (D19)", () => {
  it("cannot write members, seasons, settings or entries without an acting staff user", async () => {
    const m = await service.from("members").insert({ full_name: "S", phone: nextPhone(), coach_id: COACH1 });
    expect(m.error?.message).toMatch(/FORBIDDEN: no acting staff user/);
    const s = await service.from("seasons").insert({ name: "S", type: "championship", starts_on: "1890-01-01", ends_on: "1890-01-31" });
    expect(s.error?.message).toMatch(/FORBIDDEN: no acting staff user/);
    const k = await service.from("app_settings").update({ gym_name: "S" }).eq("id", 1);
    expect(k.error?.message).toMatch(/FORBIDDEN: no acting staff user/);
    const e = await service.from("entries").insert({ member_id: MEMBER_OF_COACH2, category: "treadmill", km: 3, value: 0, performed_on: "2026-01-01", logged_by: ADMIN, season_id: PAST_SEASON });
    expect(e.error?.message).toMatch(/FORBIDDEN: no acting staff user/);
  });

  it("cannot create staff profiles once an admin exists (bootstrap only)", async () => {
    const u = await service.auth.admin.createUser({ email: `svc${Date.now()}@gym-arena.local`, password: "Probe-password-1!", email_confirm: true });
    const r = await service.from("profiles").insert({ id: u.data.user!.id, full_name: "Sneaky", role: "admin" });
    expect(r.error?.message).toMatch(/FORBIDDEN: only the admin creates staff accounts/);
  });
});

describe("profiles and roles (AC-1, SECURITY_SPECIFICATION §1–§2)", () => {
  it("coach can change only their own language (D16)", async () => {
    const ok = await coach1.from("profiles").update({ locale: "en" }).eq("id", COACH1).select("locale").single();
    expect(ok.data?.locale).toBe("en");
    await coach1.from("profiles").update({ locale: "ar" }).eq("id", COACH1);
    for (const patch of [{ role: "admin" }, { is_active: false }, { full_name: "Boss" }]) {
      const r = await coach1.from("profiles").update(patch).eq("id", COACH1);
      expect(r.error?.message, JSON.stringify(patch)).toMatch(/FORBIDDEN/);
    }
    const bad = await coach1.from("profiles").update({ locale: "fr" }).eq("id", COACH1);
    expect(bad.error).not.toBeNull();
    const other = await coach1.from("profiles").update({ locale: "en" }).eq("id", COACH2).select();
    expect(other.data ?? []).toHaveLength(0);
  });

  it("coach cannot read app_settings, audit_log or other profiles; cannot write results or audit rows", async () => {
    expect((await coach1.from("app_settings").select("*")).data ?? []).toHaveLength(0);
    expect((await coach1.from("audit_log").select("*")).data ?? []).toHaveLength(0);
    const { data: profiles } = await coach1.from("profiles").select("id");
    expect(profiles!.map((p) => p.id)).toEqual([COACH1]);
    expect((await coach1.from("audit_log").insert({ action: "x", entity_type: "x" })).error?.message).toMatch(/permission denied/);
    expect((await coach1.from("app_settings").update({ tv_locale: "en" }).eq("id", 1).select()).data ?? []).toHaveLength(0);
  });

  it("the last active admin cannot be deactivated or demoted", async () => {
    const r1 = await admin.from("profiles").update({ is_active: false }).eq("id", ADMIN);
    expect(r1.error?.message).toMatch(/LAST_ADMIN/);
    const r2 = await admin.from("profiles").update({ role: "coach" }).eq("id", ADMIN);
    expect(r2.error?.message).toMatch(/LAST_ADMIN/);
  });

  it("BR-P7 + inactive coach: a still-valid session reads nothing and can act through no path", async () => {
    const email = `probe${Date.now()}@gym-arena.local`;
    const pw = "Probe-password-1!";
    const u = await service.auth.admin.createUser({ email, password: pw, email_confirm: true });
    const id = u.data.user!.id;
    expect((await admin.from("profiles").insert({ id, full_name: "Probe Coach", role: "coach" })).error).toBeNull();
    const probe = await signIn(email, pw);
    const pm = await newMember(probe, id);

    const blocked = await admin.from("profiles").update({ is_active: false }).eq("id", id);
    expect(blocked.error?.message).toMatch(/COACH_HAS_ACTIVE_MEMBERS/);
    await admin.from("members").update({ coach_id: COACH1 }).eq("id", pm.id);
    expect((await admin.from("profiles").update({ is_active: false }).eq("id", id)).error).toBeNull();

    expect((await probe.from("seasons").select("id")).data).toHaveLength(0);
    expect((await probe.from("members").select("id")).data).toHaveLength(0);
    expect((await probe.from("members").insert({ full_name: "z", phone: nextPhone(), coach_id: id })).error).not.toBeNull();
    expect((await probe.from("profiles").update({ locale: "en" }).eq("id", id)).error?.message).toMatch(/FORBIDDEN/);
    // even the server path refuses an inactive acting user
    const viaServer = await serverLog(id, pm.id, "treadmill", { p_km: 3 });
    expect(viaServer.error?.message).toMatch(/not an active staff account/);
  });

  it("audit rows cannot be edited or deleted, even by the database owner", async () => {
    const o = owner();
    await expect(o`update public.audit_log set action = 'x' where id = (select min(id) from public.audit_log)`).rejects.toThrow(/IMMUTABLE/);
    await expect(o`delete from public.audit_log where id = (select min(id) from public.audit_log)`).rejects.toThrow(/DELETE_FORBIDDEN/);
    await o.end();
  });
});
