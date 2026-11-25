import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErrorCode } from "@/lib/api";
import type { VerifiedStaff } from "@/lib/auth";
import { chunk } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";
import type { CategoryCode } from "@/lib/supabase/types";
import type { IsoDate } from "@/lib/time";
import type { EditEntryBody, EntriesQuery } from "@/lib/validation/entries";
import { entryValue, validateEntry, type EntryInput } from "@/modules/scoring";
import { formatValue } from "./card";
import { editEntry } from "./server-writes";

/**
 * UX A5 — the admin's entries log and corrections.
 *
 * Reads use the ADMIN's own client: RLS (entries_select: admin all) applies. Corrections go
 * through the server-only write path (server_edit_entry / server_void_entry, D19) with the
 * admin taken from the verified session; the database re-applies every rule — admin role,
 * season not closed (SEASON_CLOSED), date within the same season and not in the future,
 * mandatory reason, value recomputed — and writes the audit row with before/after and the
 * reason (BR-E9, BR-E11, AC-47). Nothing is ever deleted (BR-E8).
 */
export const ENTRIES_PAGE_SIZE = 50;
const EVIDENCE = "evidence";
const EVIDENCE_URL_SECONDS = 120;

export interface AdminEntryRow {
  id: string;
  season_id: string;
  member_id: string;
  member_name: string;
  member_code: string;
  coach_name: string | null;
  category: CategoryCode;
  performed_on: IsoDate;
  weight_kg: string | null;
  reps: number | null;
  km: string | null;
  /** comparable value as shown (e1RM 1 decimal, reps, km) */
  value: string;
  has_photo: boolean;
  logged_by_name: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

export interface EntriesPage {
  rows: AdminEntryRow[];
  page: number;
  pages: number;
  total: number;
}

type Row = {
  id: string;
  season_id: string;
  member_id: string;
  category: CategoryCode;
  performed_on: IsoDate;
  weight_kg: string | null;
  reps: number | null;
  km: string | null;
  photo_path: string | null;
  logged_by: string;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  members: { full_name: string; member_code: string; coach_id: string } | null;
};

const COLUMNS =
  "id, season_id, member_id, category, performed_on, weight_kg::text, reps, km::text, photo_path, logged_by, created_at, voided_at, voided_by, void_reason, members!inner(full_name, member_code, coach_id)";

async function staffNames(client: SupabaseClient, ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const part of chunk([...new Set(ids)])) {
    const { data, error } = await client.from("profiles").select("id, full_name").in("id", part);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) names.set(p.id as string, p.full_name as string);
  }
  return names;
}

/** GET /api/entries — filterable, paginated, newest day first (UX A5). */
export async function listEntries(client: SupabaseClient, query: EntriesQuery): Promise<EntriesPage> {
  const page = query.page ?? 1;
  let q = client.from("entries").select(COLUMNS, { count: "exact" });
  if (query.season_id) q = q.eq("season_id", query.season_id);
  if (query.member_id) q = q.eq("member_id", query.member_id);
  if (query.coach_id) q = q.eq("members.coach_id", query.coach_id);
  if (query.category) q = q.eq("category", query.category);
  if (query.date) q = q.eq("performed_on", query.date);
  if (query.q) q = q.ilike("members.full_name", `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  if (query.include_voided !== "true") q = q.is("voided_at", null);
  const from = (page - 1) * ENTRIES_PAGE_SIZE;
  const { data, error, count } = await q
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + ENTRIES_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = await toAdminRows(client, (data ?? []) as unknown as Row[]);
  const total = count ?? rows.length;
  return { page, total, pages: Math.max(1, Math.ceil(total / ENTRIES_PAGE_SIZE)), rows };
}

async function toAdminRows(client: SupabaseClient, rows: readonly Row[]): Promise<AdminEntryRow[]> {
  const names = await staffNames(client, rows.flatMap((r) => [r.logged_by, r.voided_by, r.members?.coach_id].filter((x): x is string => !!x)));
  return rows.map((r) => ({
    id: r.id,
    season_id: r.season_id,
    member_id: r.member_id,
    member_name: r.members?.full_name ?? "",
    member_code: r.members?.member_code ?? "",
    coach_name: r.members ? names.get(r.members.coach_id) ?? null : null,
    category: r.category,
    performed_on: r.performed_on,
    weight_kg: r.weight_kg,
    reps: r.reps,
    km: r.km,
    value: formatValue(r.category, entryValue({ category: r.category, performedOn: r.performed_on, weightKg: r.weight_kg, reps: r.reps, km: r.km })),
    has_photo: r.photo_path !== null,
    logged_by_name: names.get(r.logged_by) ?? null,
    created_at: r.created_at,
    voided_at: r.voided_at,
    voided_by_name: r.voided_by ? names.get(r.voided_by) ?? null : null,
    void_reason: r.void_reason,
  }));
}

/** One entry as the A5 log shows it (null: not found or not visible to the caller). */
export async function getAdminEntry(client: SupabaseClient, entryId: string): Promise<AdminEntryRow | null> {
  const { data, error } = await client.from("entries").select(COLUMNS).eq("id", entryId).maybeSingle();
  if (error || !data) return null;
  return (await toAdminRows(client, [data as unknown as Row]))[0] ?? null;
}

export type CorrectionResult =
  | { ok: true; data: AdminEntryRow }
  | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string };

/**
 * PATCH /api/entries/:id — admin correction of values and/or date with a mandatory reason.
 * The merged values are checked with the scoring module's `validateEntry` (BR-E4: the same
 * rules the entry sheet and the database apply), so an invalid correction never reaches the
 * database; the database still re-checks everything for the acting admin.
 */
export async function correctEntry(client: SupabaseClient, staff: VerifiedStaff, entryId: string, body: EditEntryBody, today: IsoDate): Promise<CorrectionResult> {
  if (staff.role !== "admin") return { ok: false, code: "FORBIDDEN" };
  const { data, error } = await client.from("entries").select(COLUMNS).eq("id", entryId).maybeSingle();
  if (error) return { ok: false, code: "UNKNOWN" };
  const current = data as unknown as Row | null;
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.voided_at) return { ok: false, code: "FORBIDDEN", reason: "voided" };
  if (body.performed_on && body.performed_on > today) return { ok: false, code: "VALIDATION", reason: "future_date" };

  const lift = current.category === "deadlift" || current.category === "bench" || current.category === "squat";
  const merged: EntryInput = {
    category: current.category,
    weightKg: lift ? body.weight_kg ?? current.weight_kg : null,
    reps: current.category === "treadmill" ? null : body.reps ?? current.reps,
    km: current.category === "treadmill" ? body.km ?? current.km : null,
  };
  // fields that do not belong to the category are refused, not silently dropped
  if ((!lift && body.weight_kg !== undefined) || (current.category === "treadmill" && body.reps !== undefined) || (current.category !== "treadmill" && body.km !== undefined)) {
    return { ok: false, code: "VALIDATION", reason: "field_not_allowed" };
  }
  const invalid = validateEntry(merged)[0];
  if (invalid) return { ok: false, code: "VALIDATION", reason: `${invalid.field}:${invalid.code}` };

  const written = await editEntry(staff, entryId, {
    reason: body.reason,
    weightKg: body.weight_kg,
    reps: body.reps,
    km: body.km,
    performedOn: body.performed_on,
  });
  if (!written.ok) return { ok: false, code: written.code, reason: written.reason };
  const row = await getAdminEntry(client, entryId);
  return row ? { ok: true, data: row } : { ok: false, code: "UNKNOWN" };
}

/**
 * GET /api/entries/:id/photo — a short-lived signed URL for the evidence photo (BR-X3): the
 * entry is read with the CALLER's client first, so only the admin and the coach of that
 * member (RLS) can get it; the URL expires after two minutes.
 */
export async function evidencePhotoUrl(client: SupabaseClient, entryId: string): Promise<string | null> {
  const { data } = await client.from("entries").select("photo_path").eq("id", entryId).maybeSingle<{ photo_path: string | null }>();
  if (!data?.photo_path) return null;
  const { data: signed } = await createServiceClient().storage.from(EVIDENCE).createSignedUrl(data.photo_path, EVIDENCE_URL_SECONDS);
  return signed?.signedUrl ?? null;
}
