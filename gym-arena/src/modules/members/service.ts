import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@/lib/api";
import { errorCodeFromDb } from "@/lib/errors";
import type { Profile } from "@/lib/supabase/types";
import { chunk, fetchAll } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";
import { cleanupMemberAvatars, isAttachable, type AvatarCleanupDeps, type StoredAvatar } from "./avatar-cleanup";
import type { IsoDate } from "@/lib/time";
import { isMemberAvatarPath, type CreateMemberInput, type UpdateMemberInput } from "@/lib/validation/members";
import type { CategoryCode } from "@/modules/scoring";
import { activeSeason } from "@/modules/seasons/status";
import { rookieFlags, type EntryRowForRookie } from "./rookie";

/**
 * Members (UX A3/C5, API "Members", BR-P1 … BR-P8).
 *
 * All member, participant and assignment reads/writes use the caller's OWN session, so
 * row security (admin: all; coach: own clients) and the database rules (member code,
 * forced coach for coaches, active-coach guard, audit) apply unchanged. The service role
 * is used only after the route has authorized the caller, for: avatar storage
 * housekeeping (signed upload URLs, existence checks, deleting replaced files) and
 * reading coach display names for the assignment history.
 */
export type Viewer = Pick<Profile, "id" | "role">;
export type MemberResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string; extra?: Record<string, string> };

const AVATARS = "avatars";
const SIGNED_URL_SECONDS = 3600; // BR-X3: short-lived
const MEMBER_COLUMNS = "id, member_code, full_name, phone, photo_path, photo_consent, coach_id, status, joined_on, created_at";

interface MemberRow {
  id: string;
  member_code: string;
  full_name: string;
  phone: string;
  photo_path: string | null;
  photo_consent: boolean;
  coach_id: string;
  status: "active" | "inactive";
  joined_on: string;
  created_at: string;
}

export interface MemberListItem extends Omit<MemberRow, "photo_path"> {
  photo_url: string | null;
  coach_name: string | null;
  /** null when no season is active (rookie is relative to the active season) */
  is_rookie: boolean | null;
  today_logged: CategoryCode[];
}

export interface MemberDetail extends MemberListItem {
  has_photo: boolean;
  assignments: Array<{ coach_id: string; coach_name: string | null; started_at: string; ended_at: string | null }>;
  plan: { season_id: string; season_name: string; planned_sessions: number } | null;
}

/** DB rule violations → stable code + a reason the UI translates. */
export function memberDbError(message: string | undefined): { code: ErrorCode | "UNKNOWN"; reason?: string } {
  if (!message) return { code: "UNKNOWN" };
  if (message.includes("COACH_NOT_ACTIVE")) return { code: "VALIDATION", reason: "coach_not_active" };
  if (message.includes("members_phone_key")) return { code: "VALIDATION", reason: "phone_taken" };
  if (message.includes("members_phone_check")) return { code: "VALIDATION", reason: "invalid_phone" };
  if (message.includes("members_photo_path_check")) return { code: "VALIDATION", reason: "invalid_photo" };
  if (message.includes("participants_planned_sessions_check") || message.includes("planned_sessions")) return { code: "VALIDATION", reason: "invalid_plan" };
  return { code: errorCodeFromDb(message) };
}

/** Strip characters that have meaning in PostgREST filter syntax. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\:"']/g, " ").trim().slice(0, 60);
}

async function signedPhotoUrls(client: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data } = await client.storage.from(AVATARS).createSignedUrls(paths, SIGNED_URL_SECONDS);
  for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  return urls;
}

async function seasonsList(client: SupabaseClient) {
  const { data } = await client.from("seasons").select("id, name, type, starts_on, ends_on, closed_at");
  return (data ?? []) as Array<{ id: string; name: string; type: "preseason" | "championship"; starts_on: string; ends_on: string; closed_at: string | null }>;
}

async function decorate(client: SupabaseClient, rows: MemberRow[], today: IsoDate, withRookies = true): Promise<MemberListItem[]> {
  const ids = rows.map((r) => r.id);
  const coachIds = [...new Set(rows.map((r) => r.coach_id))];
  const [coaches, todayEntries, seasons, urls] = await Promise.all([
    coachIds.length ? client.from("profiles").select("id, full_name").in("id", coachIds) : Promise.resolve({ data: [] }),
    fetchAll<{ member_id: string; category: CategoryCode }>((from, to) =>
      client.from("entries").select("member_id, category").eq("performed_on", today).is("voided_at", null).order("id").range(from, to) as never),
    seasonsList(client),
    signedPhotoUrls(client, rows.map((r) => r.photo_path).filter((p): p is string => !!p)),
  ]);
  const coachName = new Map((coaches.data ?? []).map((c) => [c.id as string, c.full_name as string]));
  const logged = new Map<string, CategoryCode[]>();
  for (const e of todayEntries) logged.set(e.member_id, [...(logged.get(e.member_id) ?? []), e.category]);

  // Rookie: exactly the scoring module's definition, relative to the active season.
  const active = activeSeason(seasons, today);
  let rookies: Map<string, boolean> | null = null;
  if (active && withRookies) {
    // Every pre-season entry, read in full: one capped request (max_rows) silently dropped
    // rows and flagged members with a baseline as rookies on a busy database.
    const before: EntryRowForRookie[] = [];
    for (const memberIds of chunk(ids)) {
      before.push(...(await fetchAll<EntryRowForRookie>((from, to) =>
        client.from("entries").select("id, member_id, category, performed_on, weight_kg::text, reps, km::text, voided_at")
          .in("member_id", memberIds).lt("performed_on", active.starts_on).order("id").range(from, to) as never)));
    }
    rookies = rookieFlags({ type: active.type, startsOn: active.starts_on, endsOn: active.ends_on }, ids, before);
  }

  return rows.map(({ photo_path, ...row }) => ({
    ...row,
    photo_url: photo_path ? urls.get(photo_path) ?? null : null,
    coach_name: coachName.get(row.coach_id) ?? null,
    is_rookie: rookies ? rookies.get(row.id) ?? true : null,
    today_logged: logged.get(row.id) ?? [],
  }));
}

export async function listMembers(
  client: SupabaseClient,
  filters: { q?: string; coach_id?: string; status?: "active" | "inactive" },
  today: IsoDate,
  /** callers that compute rookies from a full history themselves (coach Today) skip this read */
  options: { rookies?: boolean } = {},
): Promise<MemberListItem[]> {
  const q = filters.q ? sanitizeSearch(filters.q) : "";
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  // every member, page by page: one request is capped at max_rows (1000) and silently
  // dropped the rest once a gym had more members than that
  const rows = await fetchAll<MemberRow>((from, to) => {
    let query = client.from("members").select(MEMBER_COLUMNS);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.coach_id) query = query.eq("coach_id", filters.coach_id);
    if (q) {
      const parts = [`full_name.ilike.*${q}*`, `member_code.ilike.*${q}*`];
      if (digits.length >= 3) parts.push(`phone.ilike.*${digits}*`);
      query = query.or(parts.join(","));
    }
    return query.order("full_name").order("id").range(from, to) as never;
  });
  return decorate(client, rows, today, options.rookies ?? true);
}

export async function getMember(client: SupabaseClient, id: string, today: IsoDate): Promise<MemberDetail | null> {
  const { data } = await client.from("members").select(MEMBER_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null; // not found, or not this coach's client (RLS)
  const row = data as MemberRow;
  const [[item], assignments, seasons] = await Promise.all([
    decorate(client, [row], today),
    client.from("coach_assignments").select("coach_id, started_at, ended_at").eq("member_id", id).order("started_at", { ascending: false }),
    seasonsList(client),
  ]);
  // Coach display names for the history (names only), read after authorization.
  const historyCoachIds = [...new Set((assignments.data ?? []).map((a) => a.coach_id as string))];
  const { data: names } = historyCoachIds.length
    ? await createServiceClient().from("profiles").select("id, full_name").in("id", historyCoachIds)
    : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id as string, n.full_name as string]));
  const active = activeSeason(seasons, today);
  let plan: MemberDetail["plan"] = null;
  if (active) {
    const { data: p } = await client.from("season_participants").select("planned_sessions").eq("season_id", active.id).eq("member_id", id).maybeSingle();
    if (p) plan = { season_id: active.id, season_name: active.name, planned_sessions: p.planned_sessions };
  }
  return {
    ...item,
    has_photo: !!row.photo_path,
    assignments: (assignments.data ?? []).map((a) => ({ ...a, coach_name: nameOf.get(a.coach_id) ?? null })) as MemberDetail["assignments"],
    plan,
  };
}

export async function createMember(
  client: SupabaseClient,
  viewer: Viewer,
  input: CreateMemberInput,
  today: IsoDate,
): Promise<MemberResult<{ id: string; member_code: string }>> {
  if (viewer.role === "admin" && !input.coach_id) return { ok: false, code: "VALIDATION", reason: "coach_required" };
  const { data, error } = await client
    .from("members")
    .insert({
      full_name: input.full_name,
      phone: input.phone,
      photo_consent: input.photo_consent,
      // AC-5: for a coach the database assigns the coach themselves, whatever is sent
      coach_id: viewer.role === "coach" ? viewer.id : input.coach_id,
    })
    .select("id, member_code")
    .single();
  if (error || !data) {
    const mapped = memberDbError(error?.message);
    if (mapped.reason === "phone_taken" && viewer.role === "admin") {
      // only the admin may learn which member already has this number
      const { data: existing } = await client.from("members").select("member_code").eq("phone", input.phone).maybeSingle();
      if (existing) return { ok: false, ...mapped, extra: { existing_code: existing.member_code } };
    }
    return { ok: false, ...mapped };
  }
  if (input.planned_sessions !== undefined) {
    const plan = await setPlan(client, data.id, input.planned_sessions, today);
    if (!plan.ok && plan.code !== "NO_ACTIVE_SEASON") return { ok: false, code: plan.code, reason: plan.reason };
  }
  return { ok: true, data: { id: data.id, member_code: data.member_code } };
}

export async function updateMember(client: SupabaseClient, viewer: Viewer, id: string, patch: UpdateMemberInput): Promise<MemberResult<null>> {
  const { photo_path, ...fields } = patch;
  if (Object.keys(fields).length > 0) {
    const { data, error } = await client.from("members").update(fields).eq("id", id).select("id");
    if (error) {
      const mapped = memberDbError(error.message);
      if (mapped.reason === "phone_taken" && viewer.role === "admin" && fields.phone) {
        const { data: existing } = await client.from("members").select("member_code").eq("phone", fields.phone).maybeSingle();
        if (existing) return { ok: false, ...mapped, extra: { existing_code: existing.member_code } };
      }
      return { ok: false, ...mapped };
    }
    if (!data || data.length === 0) return { ok: false, code: "NOT_FOUND" };
  }
  if (photo_path !== undefined) return setPhoto(client, id, photo_path);
  return { ok: true, data: null };
}

/** Storage + database access for the deferred avatar cleanup (service role, server only). */
function avatarCleanupDeps(): AvatarCleanupDeps {
  const service = createServiceClient();
  const storage = service.storage.from(AVATARS);
  return {
    async listFolder(memberId) {
      const { data, error } = await storage.list(`members/${memberId}`, { limit: 1000 });
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((f) => f.id) // folders have no id
        .map((f) => ({ path: `members/${memberId}/${f.name}`, createdAt: f.created_at ? new Date(f.created_at) : new Date() }));
    },
    async readMember(memberId) {
      const { data, error } = await service.from("members").select("photo_path, updated_at").eq("id", memberId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { photoPath: data.photo_path as string | null, updatedAt: new Date(data.updated_at as string) } : null;
    },
    async referencedPaths(paths) {
      const { data, error } = await service.from("members").select("photo_path").in("photo_path", paths);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r) => r.photo_path as string));
    },
    async remove(paths) {
      const { error } = await storage.remove(paths);
      if (error) throw new Error(error.message);
    },
  };
}

/** Best-effort deferred cleanup of this member's unused avatars. Never throws. */
async function tidyAvatars(memberId: string): Promise<void> {
  try {
    await cleanupMemberAvatars(memberId, new Date(), avatarCleanupDeps());
  } catch {
    // cleanupMemberAvatars never throws; this also covers building the client
  }
}

/**
 * Replace or remove the member's photo (decision 4, hardened):
 * 1. the new file was uploaded with a signed upload URL into this member's folder and
 *    is still fresh (AVATAR_ATTACH_WINDOW_MS) — older files can never be (re)attached;
 * 2. the database is updated (caller's session: RLS + path constraint);
 * 3. nothing is deleted now. The previous avatar and any unused uploads are removed later
 *    by the deferred cleanup (modules/members/avatar-cleanup.ts) once they are older than
 *    the grace period and referenced by no member.
 * If step 2 fails, the existing photo is untouched; the unused upload is cleaned up later.
 * Turning TV consent off never calls this.
 */
async function setPhoto(client: SupabaseClient, id: string, newPath: string | null): Promise<MemberResult<null>> {
  const { data: current } = await client.from("members").select("id").eq("id", id).maybeSingle();
  if (!current) return { ok: false, code: "NOT_FOUND" };

  if (newPath !== null) {
    if (!isMemberAvatarPath(newPath, id)) return { ok: false, code: "VALIDATION", reason: "invalid_photo" };
    let file: StoredAvatar | undefined;
    try {
      file = (await avatarCleanupDeps().listFolder(id)).find((f) => f.path === newPath);
    } catch {
      return { ok: false, code: "UNKNOWN" };
    }
    if (!file || !isAttachable(file, new Date())) return { ok: false, code: "VALIDATION", reason: "photo_missing" };
  }

  const { error } = await client.from("members").update({ photo_path: newPath }).eq("id", id);
  if (error) return { ok: false, ...memberDbError(error.message) };

  await tidyAvatars(id); // removes only files past the grace period; the new photo is never touched
  return { ok: true, data: null };
}

/** Signed upload URL for one new file in the member's folder (caller must be allowed to see the member). */
export async function avatarUploadUrl(
  client: SupabaseClient,
  memberId: string,
  contentType: "image/webp" | "image/jpeg",
): Promise<MemberResult<{ path: string; token: string }>> {
  const { data: member } = await client.from("members").select("id").eq("id", memberId).maybeSingle();
  if (!member) return { ok: false, code: "NOT_FOUND" };
  await tidyAvatars(memberId); // opportunistic: abandoned uploads from earlier attempts
  const path = `members/${memberId}/${randomUUID()}.${contentType === "image/webp" ? "webp" : "jpg"}`;
  const { data, error } = await createServiceClient().storage.from(AVATARS).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, code: "UNKNOWN" };
  return { ok: true, data: { path: data.path, token: data.token } };
}

export async function reassignMember(client: SupabaseClient, id: string, coachId: string): Promise<MemberResult<null>> {
  const { data, error } = await client.from("members").update({ coach_id: coachId }).eq("id", id).select("id");
  if (error) return { ok: false, ...memberDbError(error.message) };
  if (!data || data.length === 0) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, data: null };
}

/** Activate / deactivate (BR-P5). Reactivation may assign an active coach in the same change (decision 5). */
export async function setMemberStatus(
  client: SupabaseClient,
  id: string,
  status: "active" | "inactive",
  coachId?: string,
): Promise<MemberResult<null>> {
  const patch: Record<string, string> = { status };
  if (status === "active" && coachId) patch.coach_id = coachId;
  const { data, error } = await client.from("members").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, ...memberDbError(error.message) };
  if (!data || data.length === 0) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, data: null };
}

/** Planned sessions for the ACTIVE season (BR-P4; API PATCH /api/members/:id/plan). */
export async function setPlan(client: SupabaseClient, id: string, planned: number, today: IsoDate): Promise<MemberResult<{ planned_sessions: number }>> {
  const active = activeSeason(await seasonsList(client), today);
  if (!active) return { ok: false, code: "NO_ACTIVE_SEASON" };
  const { data, error } = await client
    .from("season_participants")
    .update({ planned_sessions: planned })
    .eq("season_id", active.id)
    .eq("member_id", id)
    .select("planned_sessions");
  if (error) return { ok: false, ...memberDbError(error.message) };
  if (!data || data.length === 0) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, data: { planned_sessions: data[0].planned_sessions } };
}
