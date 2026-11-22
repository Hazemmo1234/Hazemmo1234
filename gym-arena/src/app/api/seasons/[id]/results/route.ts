import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, type ErrorCode } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { seasonResults } from "@/modules/seasons/lifecycle";

// GET /api/seasons/:id/results (admin, coach) → { board, unranked } — the frozen results of a
// closed season (D30): ranked main board and rookies as stored, plus members inactive at close
// (member_active: false, no rank — D29). 409 CONFLICT while the season is not closed.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "coach");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return apiError("NOT_FOUND", "Season not found");
  const result = await seasonResults(await createClient(), { id: auth.profile.id, role: auth.profile.role }, id, today());
  if (!result.ok) return apiError((result.code === "UNKNOWN" ? "CONFLICT" : result.code) as ErrorCode, "Could not read results", result.reason);
  return NextResponse.json(result.data);
}
