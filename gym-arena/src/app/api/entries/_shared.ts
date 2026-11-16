import "server-only";

import { NextResponse } from "next/server";
import { apiError, type ErrorCode } from "@/lib/api";
import { requireStaff, type VerifiedStaff } from "@/lib/auth";

/** Turn a service error into the API error shape (UNKNOWN → 422 VALIDATION without detail). */
export function entryError(result: { code: ErrorCode | "UNKNOWN"; reason?: string }, message: string) {
  return apiError(result.code === "UNKNOWN" ? "VALIDATION" : result.code, message, result.reason);
}

/** Admin or coach, from the VERIFIED session (D19, AC-40) — never from the request. */
export async function staffOr401(): Promise<{ staff: VerifiedStaff } | { error: NextResponse }> {
  const staff = await requireStaff();
  if (!staff) return { error: apiError("UNAUTHENTICATED", "Sign in required") };
  return { staff };
}
