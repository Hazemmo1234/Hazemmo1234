import "server-only";

import type { VerifiedStaff } from "@/lib/auth";
import { errorCodeFromDb } from "@/lib/errors";
import type { ErrorCode } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/service";
import type { CategoryCode, EntryRow } from "@/lib/supabase/types";

/**
 * The ONLY way the application writes entries and attendance (D19, BR-X4).
 *
 * - `staff` must come from `requireStaff()` (verified session); never build it from
 *   request data.
 * - The service role only carries the call. The database functions re-apply every
 *   rule for that acting user (role, own member, today-only, void ownership and
 *   window, admin reasons, season lock), so this module cannot be used to skip them.
 * - BR-E6 (photo rule) needs the scoring module and is checked by the API route
 *   immediately before `logEntry` (M3).
 */
export type WriteResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | "UNKNOWN"; reason?: string };

export interface LogEntryInput {
  memberId: string;
  category: CategoryCode;
  /** decimal strings keep the exact value the coach typed ("72.5") */
  weightKg?: number | string;
  reps?: number;
  km?: number | string;
  photoPath?: string;
  /** Honoured for admins only; the database ignores it for coaches (BR-E3). */
  performedOn?: string;
}

function result<T>(data: T | null, error: { message: string } | null): WriteResult<T> {
  if (error || data === null) {
    // the evidence-once index (migration 20261116000001) closes the same-photo race atomically
    const reason = error?.message.includes("PHOTO_USED") ? "photo_used" : undefined;
    return { ok: false, code: errorCodeFromDb(error?.message), ...(reason ? { reason } : {}) };
  }
  return { ok: true, data };
}

export async function logEntry(staff: VerifiedStaff, input: LogEntryInput): Promise<WriteResult<EntryRow>> {
  const { data, error } = await createServiceClient().rpc("server_log_entry", {
    p_actor: staff.id,
    p_member_id: input.memberId,
    p_category: input.category,
    p_weight_kg: input.weightKg ?? null,
    p_reps: input.reps ?? null,
    p_km: input.km ?? null,
    p_photo_path: input.photoPath ?? null,
    p_performed_on: input.performedOn ?? null,
  });
  return result<EntryRow>(data, error);
}

/** BR-E9: coach — own submission, same day. Admin — any, until close, reason required. */
export async function voidEntry(staff: VerifiedStaff, entryId: string, reason?: string): Promise<WriteResult<EntryRow>> {
  const { data, error } = await createServiceClient().rpc("server_void_entry", {
    p_actor: staff.id,
    p_entry_id: entryId,
    p_reason: reason ?? null,
  });
  return result<EntryRow>(data, error);
}

export interface EditEntryInput {
  weightKg?: number;
  reps?: number;
  km?: number;
  performedOn?: string;
  reason: string;
}

/** Admin only, until close; the reason is mandatory and audited (BR-E9, BR-E11). */
export async function editEntry(staff: VerifiedStaff, entryId: string, input: EditEntryInput): Promise<WriteResult<EntryRow>> {
  const { data, error } = await createServiceClient().rpc("server_edit_entry", {
    p_actor: staff.id,
    p_entry_id: entryId,
    p_reason: input.reason,
    p_weight_kg: input.weightKg ?? null,
    p_reps: input.reps ?? null,
    p_km: input.km ?? null,
    p_performed_on: input.performedOn ?? null,
  });
  return result<EntryRow>(data, error);
}

/** BR-E7: one-tap "Attended" with no result. */
export async function logAttendance(staff: VerifiedStaff, memberId: string, attendedOn?: string): Promise<WriteResult<{ id: string }>> {
  const { data, error } = await createServiceClient().rpc("server_log_attendance", {
    p_actor: staff.id,
    p_member_id: memberId,
    p_attended_on: attendedOn ?? null,
  });
  return result<{ id: string }>(data, error);
}
