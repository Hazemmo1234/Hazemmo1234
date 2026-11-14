import { ERROR_STATUS, type ErrorCode } from "@/lib/api";

/**
 * Maps a database rule violation (raised by the triggers in supabase/migrations)
 * to a stable API error code. The UI translates codes, never messages (D15).
 */
const PREFIXES: Array<[RegExp, ErrorCode]> = [
  [/^ALREADY_LOGGED_TODAY/, "ALREADY_LOGGED_TODAY"],
  [/^NO_ACTIVE_SEASON/, "NO_ACTIVE_SEASON"],
  [/^SEASON_CLOSED/, "SEASON_CLOSED"],
  [/^VOID_WINDOW_PASSED/, "VOID_WINDOW_PASSED"],
  [/^NOT_FOUND/, "NOT_FOUND"],
  [/^(FORBIDDEN|MEMBER_INACTIVE|LAST_ADMIN|COACH_HAS_ACTIVE_MEMBERS)/, "FORBIDDEN"],
  [/^(VALIDATION|SEASON_NOT_ENDED|INCOMPLETE_RESULTS)/, "VALIDATION"],
  [/violates check constraint|invalid input|seasons_no_overlap/, "VALIDATION"],
  [/permission denied|row-level security/, "FORBIDDEN"],
];

export function errorCodeFromDb(message: string | null | undefined): ErrorCode | "UNKNOWN" {
  if (!message) return "UNKNOWN";
  for (const [pattern, code] of PREFIXES) if (pattern.test(message)) return code;
  return "UNKNOWN";
}

export function statusFor(code: ErrorCode | "UNKNOWN"): number {
  return code === "UNKNOWN" ? 500 : ERROR_STATUS[code];
}
