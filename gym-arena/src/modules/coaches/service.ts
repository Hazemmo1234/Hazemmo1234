import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { ErrorCode } from "@/lib/api";
import { errorCodeFromDb } from "@/lib/errors";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";
import type { CreateCoachInput } from "@/lib/validation/coaches";

/**
 * Coach accounts (UX A4, BR-P7, D28).
 *
 * Two systems hold a coach's access, and both are kept in step:
 * - the staff profile (`profiles.is_active`) — checked by the middleware, every API
 *   route and every database rule (RLS helpers require an active profile);
 * - the Supabase Auth account — a ban refuses new sign-ins AND rejects the coach's
 *   existing access/refresh tokens immediately (verified on the test stack).
 *
 * Profile changes run through the ADMIN'S OWN session, so RLS and the database rules
 * (only admins create staff; a coach with active clients cannot be deactivated) stay
 * authoritative. The service role is used only for the Auth account operations, which
 * have no other API, and only after the route has verified the caller is an admin.
 * Passwords are passed straight to Supabase Auth and never stored, returned or logged.
 */
export interface CoachListItem {
  id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  /** Supabase Auth ban in force (sign-in blocked, sessions rejected) */
  sign_in_blocked: boolean;
  active_clients: number;
  created_at: string;
}

export type CoachResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string };

/** "Permanent" ban for a deactivated coach; lifted explicitly on reactivation. */
const BAN_DURATION = "876000h"; // 100 years

function isBanned(user: Pick<User, "banned_until"> | undefined): boolean {
  return !!user?.banned_until && new Date(user.banned_until).getTime() > Date.now();
}

async function authUsersById(): Promise<Map<string, User>> {
  const service = createServiceClient();
  const byId = new Map<string, User>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    data.users.forEach((u) => byId.set(u.id, u));
    if (data.users.length < 200) break;
  }
  return byId;
}

export async function listCoaches(admin: SupabaseClient): Promise<CoachListItem[]> {
  const [profiles, members, users] = await Promise.all([
    admin.from("profiles").select("id, full_name, is_active, created_at").eq("role", "coach").order("full_name"),
    // every active member, page by page (one request is capped at max_rows = 1000)
    fetchAll<{ coach_id: string }>((from, to) =>
      admin.from("members").select("coach_id").eq("status", "active").order("id").range(from, to) as never),
    authUsersById(),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  const clients = new Map<string, number>();
  for (const m of members) clients.set(m.coach_id, (clients.get(m.coach_id) ?? 0) + 1);
  return (profiles.data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: users.get(p.id)?.email ?? null,
    is_active: p.is_active,
    sign_in_blocked: isBanned(users.get(p.id)),
    active_clients: clients.get(p.id) ?? 0,
    created_at: p.created_at,
  }));
}

/** Create the Auth account, then the profile (as the admin). Undo the account if the profile fails. */
export async function createCoach(admin: SupabaseClient, input: CreateCoachInput): Promise<CoachResult<{ id: string }>> {
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true, // D2: accounts are created by the admin; no email verification flow
    user_metadata: { full_name: input.full_name },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || /already been registered/i.test(error?.message ?? "")) {
      return { ok: false, code: "VALIDATION", reason: "email_taken" };
    }
    if (error?.code === "weak_password") return { ok: false, code: "VALIDATION", reason: "password_too_short" };
    return { ok: false, code: "UNKNOWN" };
  }
  const profile = await admin.from("profiles").insert({ id: data.user.id, full_name: input.full_name, role: "coach" });
  if (profile.error) {
    await service.auth.admin.deleteUser(data.user.id); // compensation: no orphan account
    return { ok: false, code: errorCodeFromDb(profile.error.message) };
  }
  return { ok: true, data: { id: data.user.id } };
}

async function getCoach(admin: SupabaseClient, id: string) {
  const { data } = await admin.from("profiles").select("id, role, is_active").eq("id", id).maybeSingle();
  return data && data.role === "coach" ? data : null;
}

export async function renameCoach(admin: SupabaseClient, id: string, fullName: string): Promise<CoachResult<null>> {
  if (!(await getCoach(admin, id))) return { ok: false, code: "NOT_FOUND" };
  const { error } = await admin.from("profiles").update({ full_name: fullName }).eq("id", id);
  return error ? { ok: false, code: errorCodeFromDb(error.message) } : { ok: true, data: null };
}

/**
 * Deactivate (D28). Order chosen so a partial failure never leaves extra access:
 * 1. profile → inactive (database enforces BR-P7; audited as coach.deactivate).
 *    If this fails nothing has changed.
 * 2. Auth ban → new sign-ins refused, existing sessions rejected.
 *    If this fails the profile is already inactive, so every app and database path
 *    already refuses the coach; the admin is told and can retry (idempotent).
 */
export async function deactivateCoach(admin: SupabaseClient, id: string): Promise<CoachResult<null>> {
  const coach = await getCoach(admin, id);
  if (!coach) return { ok: false, code: "NOT_FOUND" };
  if (coach.is_active) {
    const { error } = await admin.from("profiles").update({ is_active: false }).eq("id", id);
    if (error) {
      if (error.message.includes("COACH_HAS_ACTIVE_MEMBERS")) return { ok: false, code: "FORBIDDEN", reason: "has_active_clients" };
      return { ok: false, code: errorCodeFromDb(error.message) };
    }
  }
  const ban = await createServiceClient().auth.admin.updateUserById(id, { ban_duration: BAN_DURATION });
  if (ban.error) return { ok: false, code: "UNKNOWN", reason: "auth_sync_failed" };
  return { ok: true, data: null };
}

/**
 * Reactivate. Order chosen so a partial failure never grants access early:
 * 1. lift the Auth ban — if this fails nothing has changed;
 * 2. profile → active (audited as coach.activate) — until this succeeds the inactive
 *    profile still refuses the coach everywhere; retry is safe.
 */
export async function reactivateCoach(admin: SupabaseClient, id: string): Promise<CoachResult<null>> {
  const coach = await getCoach(admin, id);
  if (!coach) return { ok: false, code: "NOT_FOUND" };
  const unban = await createServiceClient().auth.admin.updateUserById(id, { ban_duration: "none" });
  if (unban.error) return { ok: false, code: "UNKNOWN", reason: "auth_sync_failed" };
  if (!coach.is_active) {
    const { error } = await admin.from("profiles").update({ is_active: true }).eq("id", id);
    if (error) return { ok: false, code: errorCodeFromDb(error.message), reason: "auth_sync_failed" };
  }
  return { ok: true, data: null };
}
