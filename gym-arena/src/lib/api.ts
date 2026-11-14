import { NextResponse } from "next/server";

/** API_SPECIFICATION error codes. */
export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  NO_ACTIVE_SEASON: 409,
  ALREADY_LOGGED_TODAY: 409,
  PHOTO_REQUIRED: 422,
  SEASON_CLOSED: 409,
  VOID_WINDOW_PASSED: 403,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export function apiError(code: ErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: ERROR_STATUS[code] });
}
