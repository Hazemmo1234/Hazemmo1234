import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@/lib/api";
import type { VerifiedStaff } from "@/lib/auth";
import { chunk, fetchAll } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";
import type { EntryRow } from "@/lib/supabase/types";
import type { CreateEntryBody, PreviewBody } from "@/lib/validation/entries";
import { listMembers, type MemberListItem } from "@/modules/members/service";
import { entryValue, type EntryInput, type IsoDate } from "@/modules/scoring";
import { activeSeason, nextScheduledSeason, seasonDaysLeft, seasonStatus } from "@/modules/seasons/status";
import {
  buildMemberCard,
  buildPreview,
  formatValue,
  participantHistory,
  toScoringEntry,
  photoRequiredFor,
  type AttendanceRecordRow,
  type CardSeason,
  type EntryRecord,
  type MemberCard,
  type PreviewPayload,
} from "./card";
import {
  cleanupEvidence,
  evidenceFolder,
  isAttachableEvidence,
  isEvidencePath,
  type EvidenceCleanupDeps,
  type StoredEvidence,
} from "./evidence";
import { logAttendance, logEntry, voidEntry as serverVoidEntry } from "./server-writes";

/**
 * Coach workflow (M3): Today, member card, entry preview and save, evidence photos,
 * attendance, same-day undo and the activity log.
 *
 * Reads use the caller's own client, so RLS decides what is visible (a coach: own clients
 * only — BR-X1). Writes go through the server-only database functions (D19), which
 * re-check every rule for the verified acting user. The one rule the database cannot
 * apply — the photo rule (BR-E6, SCORING §6) — is checked here with modules/scoring,
 * on the stored history, immediately before the write.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string };

const EVIDENCE = "evidence";

const ENTRY_COLUMNS =
  "id, member_id, category, performed_on, weight_kg::text, reps, km::text, photo_path, logged_by, created_at, voided_at";

interface SeasonRow {
  id: string;
  name: string;
  type: "preseason" | "championship";
  starts_on: string;
  ends_on: string;
  closed_at: string | null;
}

export interface SeasonContext {
  /** the season covering today, if it is open (BR-S4) */
  current: CardSeason | null;
  /** the next season to start, for "No active championship — next starts DATE" */
  next: CardSeason | null;
  /** a season covering today that is already closed (read-only tiles) */
  closed: CardSeason | null;
}

function toCardSeason(s: SeasonRow, today: IsoDate): CardSeason {
  return {
    id: s.id, name: s.name, type: s.type, starts_on: s.starts_on, ends_on: s.ends_on,
    status: seasonStatus(s, today), days_left: seasonDaysLeft(s, today),
  };
}

export async function seasonContext(client: SupabaseClient, today: IsoDate): Promise<SeasonContext> {
  const { data, error } = await client.from("seasons").select("id, name, type, starts_on, ends_on, closed_at");
  if (error) throw new Error(error.message);
  const seasons = (data ?? []) as SeasonRow[];
  const current = activeSeason(seasons, today);
  const next = nextScheduledSeason(seasons, today);
  const closed = seasons.find((s) => s.closed_at && s.starts_on <= today && today <= s.ends_on) ?? null;
  return {
    current: current ? toCardSeason(current, today) : null,
    next: next ? toCardSeason(next, today) : null,
    closed: closed ? toCardSeason(closed, today) : null,
  };
}

interface Histories {
  entries: Map<string, EntryRecord[]>;
  attendance: Map<string, AttendanceRecordRow[]>;
  planned: Map<string, number>;
}

/**
 * Everything the scoring module needs for these members, read in full (paginated — never
 * truncated by the API row limit): every entry up to the season's end (baselines are the
 * entries before it), the season's attendance and plans. Between seasons: today only.
 */
export async function loadHistories(client: SupabaseClient, season: CardSeason | null, memberIds: string[], today: IsoDate): Promise<Histories> {
  const out: Histories = { entries: new Map(), attendance: new Map(), planned: new Map() };
  for (const ids of chunk(memberIds)) {
    const [entries, attendance, planned] = await Promise.all([
      fetchAll<EntryRecord>((from, to) => {
        const q = client.from("entries").select(ENTRY_COLUMNS).in("member_id", ids);
        return (season ? q.lte("performed_on", season.ends_on) : q.eq("performed_on", today)).order("id").range(from, to) as never;
      }),
      fetchAll<AttendanceRecordRow>((from, to) => {
        const q = client.from("attendance").select("id, member_id, attended_on, voided_at, created_at").in("member_id", ids);
        return (season ? q.gte("attended_on", season.starts_on).lte("attended_on", season.ends_on) : q.eq("attended_on", today))
          .order("id").range(from, to) as never;
      }),
      season
        ? fetchAll<{ member_id: string; planned_sessions: number }>((from, to) =>
            client.from("season_participants").select("member_id, planned_sessions").eq("season_id", season.id).in("member_id", ids)
              .order("member_id").range(from, to) as never)
        : Promise.resolve([]),
    ]);
    for (const e of entries) out.entries.set(e.member_id, [...(out.entries.get(e.member_id) ?? []), e]);
    for (const a of attendance) out.attendance.set(a.member_id, [...(out.attendance.get(a.member_id) ?? []), a]);
    for (const p of planned) out.planned.set(p.member_id, p.planned_sessions);
  }
  return out;
}

function cardFrom(h: Histories, memberId: string, season: CardSeason | null, today: IsoDate, viewerId: string): MemberCard {
  const entries = h.entries.get(memberId) ?? [];
  const history = participantHistory(memberId, h.planned.get(memberId) ?? 12, entries, h.attendance.get(memberId) ?? []);
  return buildMemberCard({ season, history, entries, today, viewerId });
}

/** GET /api/members/:id card (API_SPECIFICATION "Member season card"). Null = not visible. */
export async function memberCard(client: SupabaseClient, viewerId: string, memberId: string, today: IsoDate): Promise<MemberCard | null> {
  const { data: member } = await client.from("members").select("id").eq("id", memberId).maybeSingle();
  if (!member) return null;
  const ctx = await seasonContext(client, today);
  const h = await loadHistories(client, ctx.current, [memberId], today);
  return cardFrom(h, memberId, ctx.current, today, viewerId);
}

// ───────────────────────────── Today (UX C2) ─────────────────────────────

export interface TodayMember extends MemberListItem {
  card: MemberCard;
  /** most recent activity today (entry or attendance), for "logged today first" sorting */
  last_activity_at: string | null;
}

export interface TodayOverview {
  context: SeasonContext;
  members: TodayMember[];
  summary: { members: number; active_today: number; entries_today: number; attended_today: number };
}

export async function todayOverview(client: SupabaseClient, viewerId: string, today: IsoDate): Promise<TodayOverview> {
  const [context, members] = await Promise.all([seasonContext(client, today), listMembers(client, { status: "active" }, today, { rookies: false })]);
  const h = await loadHistories(client, context.current, members.map((m) => m.id), today);
  const rows: TodayMember[] = members.map((m) => {
    const card = cardFrom(h, m.id, context.current, today, viewerId);
    const todayTimes = [
      ...(h.entries.get(m.id) ?? []).filter((e) => e.performed_on === today && !e.voided_at).map((e) => e.created_at),
      ...(h.attendance.get(m.id) ?? []).filter((a) => a.attended_on === today && !a.voided_at).map((a) => a.created_at ?? ""),
    ].sort();
    return { ...m, is_rookie: context.current ? card.is_rookie : null, card, last_activity_at: todayTimes.at(-1) ?? null };
  });
  // UX C2: logged today first (most recent on top), then alphabetical
  rows.sort((a, b) => {
    const at = a.last_activity_at, bt = b.last_activity_at;
    if (at !== null && bt === null) return -1;
    if (at === null && bt !== null) return 1;
    if (at !== null && bt !== null && at !== bt) return at < bt ? 1 : -1;
    return a.full_name.localeCompare(b.full_name);
  });
  const entriesToday = rows.reduce((n, r) => n + r.card.today_entries.filter((e) => !e.voided).length, 0);
  return {
    context,
    members: rows,
    summary: {
      members: rows.length,
      active_today: rows.filter((r) => r.last_activity_at !== null).length,
      entries_today: entriesToday,
      attended_today: rows.filter((r) => r.card.attended_today).length,
    },
  };
}

// ───────────────────────────── Preview & save (UX C4) ─────────────────────────────

interface WriteTarget {
  season: CardSeason;
  date: IsoDate;
  histories: Histories;
}

/** Shared checks for preview and save: member visible and active, a season open on the date. */
async function target(client: SupabaseClient, viewer: { role: string }, memberId: string, today: IsoDate, performedOn?: string): Promise<Result<WriteTarget>> {
  const { data: member } = await client.from("members").select("id, status").eq("id", memberId).maybeSingle();
  if (!member) return { ok: false, code: "NOT_FOUND" };
  if (member.status !== "active") return { ok: false, code: "FORBIDDEN", reason: "member_inactive" };
  const ctx = await seasonContext(client, today);
  if (!ctx.current) return { ok: false, code: ctx.closed ? "SEASON_CLOSED" : "NO_ACTIVE_SEASON" };
  // BR-E3 / D7: only the admin may choose a date, within the active season, never in the future
  const date = viewer.role === "admin" && performedOn ? performedOn : today;
  if (date < ctx.current.starts_on || date > today) return { ok: false, code: "NO_ACTIVE_SEASON" };
  const histories = await loadHistories(client, ctx.current, [memberId], today);
  return { ok: true, data: { season: ctx.current, date, histories } };
}

function entryInput(body: PreviewBody | CreateEntryBody): EntryInput {
  return {
    category: body.category,
    weightKg: "weight_kg" in body ? body.weight_kg : null,
    reps: "reps" in body ? body.reps : null,
    km: "km" in body ? body.km : null,
  };
}

function alreadyLogged(h: Histories, memberId: string, category: string, date: IsoDate): boolean {
  return (h.entries.get(memberId) ?? []).some((e) => e.category === category && e.performed_on === date && !e.voided_at);
}

/** POST /api/entries/preview */
export async function previewForMember(client: SupabaseClient, viewer: { role: string }, body: PreviewBody, today: IsoDate): Promise<Result<PreviewPayload>> {
  const t = await target(client, viewer, body.member_id, today);
  if (!t.ok) return t;
  const { season, date, histories } = t.data;
  if (alreadyLogged(histories, body.member_id, body.category, date)) return { ok: false, code: "ALREADY_LOGGED_TODAY" };
  const history = participantHistory(body.member_id, histories.planned.get(body.member_id) ?? 12, histories.entries.get(body.member_id) ?? [], histories.attendance.get(body.member_id) ?? []);
  const result = buildPreview({ season, history, entry: entryInput(body), date });
  if (!result.ok) return { ok: false, code: "VALIDATION", reason: `${result.errors[0].field}:${result.errors[0].code}` };
  return { ok: true, data: result.preview };
}

function evidenceStorage() {
  const service = createServiceClient();
  const storage = service.storage.from(EVIDENCE);
  const deps: EvidenceCleanupDeps = {
    async listFolder(folder) {
      const { data, error } = await storage.list(folder, { limit: 1000 });
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((f) => f.id) // folders have no id
        // an unknown upload time counts as "just uploaded": never deleted, safe to attach
        .map((f) => ({ path: `${folder}/${f.name}`, createdAt: f.created_at ? new Date(f.created_at) : new Date() }));
    },
    async referencedPaths(paths) {
      const used = new Set<string>();
      for (const part of chunk(paths, 50)) {
        const { data, error } = await service.from("entries").select("photo_path").in("photo_path", part);
        if (error) throw new Error(error.message);
        for (const r of data ?? []) used.add(r.photo_path as string);
      }
      return used;
    },
    async remove(paths) {
      const { error } = await storage.remove(paths);
      if (error) throw new Error(error.message);
    },
  };
  /** The one file at `path`, looked up by name (not by listing a possibly large folder). */
  async function find(path: string): Promise<StoredEvidence | undefined> {
    const slash = path.lastIndexOf("/");
    const folder = path.slice(0, slash), name = path.slice(slash + 1);
    const { data, error } = await storage.list(folder, { search: name, limit: 10 });
    if (error) throw new Error(error.message);
    const f = (data ?? []).find((x) => x.id && x.name === name);
    return f ? { path, createdAt: f.created_at ? new Date(f.created_at) : new Date() } : undefined;
  }
  return { storage, deps, find };
}

/** POST /api/entries → { entry, member_card } */
export async function createEntry(
  client: SupabaseClient,
  staff: VerifiedStaff,
  body: CreateEntryBody,
  today: IsoDate,
): Promise<Result<{ entry: EntryRow; member_card: MemberCard }>> {
  const t = await target(client, staff, body.member_id, today, body.performed_on);
  if (!t.ok) return t;
  const { season, date, histories } = t.data;
  if (alreadyLogged(histories, body.member_id, body.category, date)) return { ok: false, code: "ALREADY_LOGGED_TODAY" };

  const input = entryInput(body);
  const history = participantHistory(body.member_id, histories.planned.get(body.member_id) ?? 12, histories.entries.get(body.member_id) ?? [], histories.attendance.get(body.member_id) ?? []);
  const preview = buildPreview({ season, history, entry: input, date });
  if (!preview.ok) return { ok: false, code: "VALIDATION", reason: `${preview.errors[0].field}:${preview.errors[0].code}` };

  // Evidence: a fresh upload in THIS member's folder for THIS season, and it must exist.
  if (body.photo_path) {
    if (!isEvidencePath(body.photo_path, season.id, body.member_id)) return { ok: false, code: "VALIDATION", reason: "invalid_photo" };
    const ev = evidenceStorage();
    let file: StoredEvidence | undefined;
    let used: Set<string>;
    try {
      [file, used] = await Promise.all([ev.find(body.photo_path), ev.deps.referencedPaths([body.photo_path])]);
    } catch {
      return { ok: false, code: "UNKNOWN" };
    }
    if (!file || !isAttachableEvidence(file, new Date())) return { ok: false, code: "VALIDATION", reason: "photo_missing" };
    // one photo is the evidence for one result (BR-E6). This early check gives a clear
    // answer; the unique index entries_photo_path_once makes it atomic under concurrency.
    if (used.has(body.photo_path)) return { ok: false, code: "VALIDATION", reason: "photo_used" };
  } else if (photoRequiredFor(season, history, input)) {
    // BR-E6 — enforced here, on the stored history, never only in the UI
    return { ok: false, code: "PHOTO_REQUIRED" };
  }

  const written = await logEntry(staff, {
    memberId: body.member_id,
    category: body.category,
    weightKg: input.weightKg ?? undefined,
    reps: input.reps ?? undefined,
    km: input.km ?? undefined,
    photoPath: body.photo_path,
    performedOn: staff.role === "admin" ? body.performed_on : undefined,
  });
  if (!written.ok) return { ok: false, code: written.code, reason: written.reason };
  const card = await memberCard(client, staff.id, body.member_id, today);
  return { ok: true, data: { entry: written.data, member_card: card! } };
}

// ───────────────────────────── Undo (BR-E9) & attendance (BR-E7) ─────────────────────────────

/** POST /api/entries/:id/void → { ok, member_card } */
export async function voidEntryFor(
  client: SupabaseClient,
  staff: VerifiedStaff,
  entryId: string,
  reason: string | undefined,
  today: IsoDate,
): Promise<Result<{ member_card: MemberCard }>> {
  const { data: entry } = await client.from("entries").select("id, member_id, voided_at").eq("id", entryId).maybeSingle();
  if (!entry) return { ok: false, code: "NOT_FOUND" }; // also another coach's client (RLS)
  if (entry.voided_at) return { ok: false, code: "FORBIDDEN", reason: "already_voided" };
  const result = await serverVoidEntry(staff, entryId, reason);
  if (!result.ok) return { ok: false, code: result.code };
  const card = await memberCard(client, staff.id, entry.member_id as string, today);
  return { ok: true, data: { member_card: card! } };
}

/** POST /api/attendance → { ok, member_card } (409 if already today) */
export async function markAttendance(client: SupabaseClient, staff: VerifiedStaff, memberId: string, today: IsoDate): Promise<Result<{ member_card: MemberCard }>> {
  const { data: member } = await client.from("members").select("id, status").eq("id", memberId).maybeSingle();
  if (!member) return { ok: false, code: "NOT_FOUND" };
  const result = await logAttendance(staff, memberId);
  if (!result.ok) return { ok: false, code: result.code };
  const card = await memberCard(client, staff.id, memberId, today);
  return { ok: true, data: { member_card: card! } };
}

// ───────────────────────────── Evidence upload (BR-X3) ─────────────────────────────

/** POST /api/uploads/evidence → one signed upload into entries/{season}/{member}/ */
export async function evidenceUploadUrl(
  client: SupabaseClient,
  memberId: string,
  contentType: "image/webp" | "image/jpeg",
  today: IsoDate,
): Promise<Result<{ path: string; token: string }>> {
  const { data: member } = await client.from("members").select("id, status").eq("id", memberId).maybeSingle();
  if (!member) return { ok: false, code: "NOT_FOUND" };
  if (member.status !== "active") return { ok: false, code: "FORBIDDEN", reason: "member_inactive" };
  const ctx = await seasonContext(client, today);
  if (!ctx.current) return { ok: false, code: ctx.closed ? "SEASON_CLOSED" : "NO_ACTIVE_SEASON" };
  const folder = evidenceFolder(ctx.current.id, memberId);
  const { storage, deps } = evidenceStorage();
  await cleanupEvidence(folder, new Date(), deps); // opportunistic: abandoned uploads past the grace period
  const path = `${folder}/${randomUUID()}.${contentType === "image/webp" ? "webp" : "jpg"}`;
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error || !data) return { ok: false, code: "UNKNOWN" };
  return { ok: true, data: { path: data.path, token: data.token } };
}

// ───────────────────────────── Activity log ─────────────────────────────

export interface ActivityRow {
  id: string;
  member_id: string;
  member_name: string;
  member_code: string;
  category: EntryRecord["category"];
  value: string;
  weight_kg: string | null;
  reps: number | null;
  km: string | null;
  performed_on: IsoDate;
  created_at: string;
  has_photo: boolean;
  voided: boolean;
  logged_by_me: boolean;
  can_undo: boolean;
}

/** Recent entries the caller may see (a coach: own clients — RLS), newest first. */
export async function activityLog(
  client: SupabaseClient,
  viewerId: string,
  range: { from: IsoDate; to: IsoDate },
  today: IsoDate,
): Promise<ActivityRow[]> {
  const rows = await fetchAll<EntryRecord & { members: { full_name: string; member_code: string } | null }>((from, to) =>
    client.from("entries").select(`${ENTRY_COLUMNS}, members(full_name, member_code)`)
      .gte("performed_on", range.from).lte("performed_on", range.to)
      .order("created_at", { ascending: false }).order("id").range(from, to) as never);
  return rows.map((e) => ({
    id: e.id,
    member_id: e.member_id,
    member_name: e.members?.full_name ?? "",
    member_code: e.members?.member_code ?? "",
    category: e.category,
    value: formatValue(e.category, entryValue(toScoringEntry(e))),
    weight_kg: e.weight_kg,
    reps: e.reps,
    km: e.km,
    performed_on: e.performed_on,
    created_at: e.created_at,
    has_photo: e.photo_path !== null,
    voided: e.voided_at !== null,
    logged_by_me: e.logged_by === viewerId,
    can_undo: e.voided_at === null && e.logged_by === viewerId && e.performed_on === today,
  }));
}
