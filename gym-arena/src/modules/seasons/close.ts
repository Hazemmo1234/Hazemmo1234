import "server-only";

import postgres from "postgres";
import type { VerifiedStaff } from "@/lib/auth";
import { closeError, runSeasonClose, type CloseResult } from "./close-core";

/**
 * POST /api/seasons/:id/close — the trusted close operation (D21, D27, SYSTEM_ARCHITECTURE
 * "Close & reveal", SECURITY_SPECIFICATION §7):
 *
 *   1. the Admin comes from the VERIFIED session (route) — passed as `staff`;
 *   2. ONE PostgreSQL transaction on ONE connection, as the restricted role
 *      `arena_season_closer` (server-only secret SEASON_CLOSE_DATABASE_URL — never logged);
 *   3. begin_season_close: re-checks the active Admin, takes the exclusive season lock BEFORE
 *      anything is read, refuses a closed or not-yet-ended season — every entry/attendance write
 *      waits on that lock and then fails with SEASON_CLOSED, and so does a second close;
 *   4. the authoritative inputs are read INSIDE the transaction (participants, members' status,
 *      pre-season bests, in-season entries and attendance);
 *   5. modules/scoring computes every point and rank (D14 — never SQL);
 *   6. finish_season_close verifies one result per participant (inactive members scored but
 *      unranked — D29), writes the frozen results, closes and audits — all or nothing.
 * A preseason (BR-S10, D20) takes the same lock and closes with no results.
 * Idempotent in effect: a repeated close is refused (SEASON_CLOSED) and changes nothing.
 */
export type { CloseResult } from "./close-core";

export async function closeSeason(staff: VerifiedStaff, seasonId: string): Promise<CloseResult> {
  if (staff.role !== "admin") return { ok: false, code: "FORBIDDEN" };
  const url = process.env.SEASON_CLOSE_DATABASE_URL;
  if (!url) return { ok: false, code: "UNKNOWN", reason: "close_not_configured" };

  // one connection, no prepared statements (works through a transaction-mode pooler too)
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5, onnotice: () => {} });
  try {
    return { ok: true, data: await runSeasonClose(sql, seasonId, staff.id) };
  } catch (e) {
    // never log the connection string; the database message carries a stable prefix
    const mapped = closeError(e instanceof Error ? e.message : undefined);
    if (mapped.code === "UNKNOWN") console.error("[season-close] failed:", (e as { code?: string })?.code ?? "error");
    return { ok: false, ...mapped };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}
