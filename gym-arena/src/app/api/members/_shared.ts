import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, type ErrorCode } from "@/lib/api";
import { today } from "@/lib/time";
import { getMember } from "@/modules/members/service";

export const uuid = z.guid();

/** Turn a service result error into the API error shape (UNKNOWN → 422 VALIDATION without detail). */
export function memberError(result: { code: ErrorCode | "UNKNOWN"; reason?: string; extra?: Record<string, string> }, message: string) {
  return apiError(result.code === "UNKNOWN" ? "VALIDATION" : result.code, message, result.reason, result.extra);
}

/**
 * API_SPECIFICATION (Members): PATCH /api/members/:id, POST …/reassign and POST …/status
 * return the member. The body is the same detail shape as GET /api/members/:id, read with
 * the caller's own session after the change, so row security still decides what is shown.
 */
export async function memberResponse(client: SupabaseClient, id: string) {
  const member = await getMember(client, id, today());
  if (!member) return apiError("NOT_FOUND", "Member not found");
  return NextResponse.json({ member });
}
