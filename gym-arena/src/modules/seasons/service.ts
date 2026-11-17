import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErrorCode } from "@/lib/api";
import { errorCodeFromDb } from "@/lib/errors";
import type { IsoDate } from "@/lib/time";
import type { CreateSeasonInput, UpdateSeasonInput } from "@/lib/validation/seasons";
import { checkSeasonUpdate } from "./rules";
import { seasonDaysLeft, seasonStatus, type SeasonStatus, type SeasonType } from "./status";

/**
 * Seasons data access. Every call uses the signed-in user's own client, so RLS (admin
 * writes, staff reads) and the season triggers apply; the service role is not used.
 */
export interface SeasonRow {
  id: string;
  name: string;
  type: SeasonType;
  starts_on: IsoDate;
  ends_on: IsoDate;
  closed_at: string | null;
  reveal_started_at: string | null;
  created_at: string;
}

export interface SeasonListItem extends SeasonRow {
  status: SeasonStatus;
  /** active: days left incl. today; scheduled: days until start */
  days: number;
  participants: number;
}

export type SeasonResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string };

const COLUMNS = "id, name, type, starts_on, ends_on, closed_at, reveal_started_at, created_at";

type SeasonWithCount = SeasonRow & { season_participants: Array<{ count: number }> };

/**
 * Newest first, each with its participant count.
 *
 * The count is an embedded aggregate (`season_participants(count)`): PostgREST computes
 * count(*) per season inside the same SQL statement, so no participant rows are
 * transferred and the API row limit (max_rows) cannot truncate it. It runs with the
 * caller's own role under RLS, exactly like the season list itself: an admin counts all
 * participants, a coach only their own clients. A season with no participants counts 0.
 */
export async function listSeasons(supabase: SupabaseClient, today: IsoDate): Promise<SeasonListItem[]> {
  const { data, error } = await supabase
    .from("seasons")
    .select(`${COLUMNS}, season_participants(count)`)
    .order("starts_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SeasonWithCount[]).map(({ season_participants, ...s }) => ({
    ...s,
    status: seasonStatus(s, today),
    days: seasonDaysLeft(s, today),
    participants: season_participants[0]?.count ?? 0,
  }));
}

/** Database rule violations → stable code + a reason the UI can translate. */
export function seasonDbError(message: string | undefined): { code: ErrorCode | "UNKNOWN"; reason?: string } {
  if (!message) return { code: "UNKNOWN" };
  if (message.includes("seasons_no_overlap")) return { code: "VALIDATION", reason: "overlap" };
  if (message.includes("ends_on cannot be before existing entries")) return { code: "VALIDATION", reason: "before_entries" };
  if (message.includes("starts_on can change only while scheduled")) return { code: "FORBIDDEN", reason: "started" };
  if (message.includes("seasons_check")) return { code: "VALIDATION", reason: "end_before_start" };
  return { code: errorCodeFromDb(message) };
}

export async function createSeason(supabase: SupabaseClient, input: CreateSeasonInput): Promise<SeasonResult<SeasonRow>> {
  // The database creates season_participants for all active members (trigger).
  const { data, error } = await supabase.from("seasons").insert(input).select(COLUMNS).single();
  if (error || !data) return { ok: false, ...seasonDbError(error?.message) };
  return { ok: true, data: data as SeasonRow };
}

export async function updateSeason(
  supabase: SupabaseClient,
  id: string,
  patch: UpdateSeasonInput,
  today: IsoDate,
): Promise<SeasonResult<SeasonRow>> {
  const { data: current, error: readError } = await supabase.from("seasons").select(COLUMNS).eq("id", id).maybeSingle();
  if (readError) return { ok: false, ...seasonDbError(readError.message) };
  if (!current) return { ok: false, code: "NOT_FOUND" };
  const violation = checkSeasonUpdate(current as SeasonRow, patch, today);
  if (violation) return { ok: false, code: violation.code, reason: violation.reason };

  const { data, error } = await supabase.from("seasons").update(patch).eq("id", id).select(COLUMNS).single();
  if (error || !data) return { ok: false, ...seasonDbError(error?.message) };
  return { ok: true, data: data as SeasonRow };
}
