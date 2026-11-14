import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, type ErrorCode } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { updateSeasonSchema } from "@/lib/validation/seasons";
import { updateSeason } from "@/modules/seasons/service";

// PATCH /api/seasons/:id (admin) { name?, ends_on?, starts_on? (scheduled only) } → season
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError("NOT_FOUND", "Season not found");
  const parsed = updateSeasonSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid update", parsed.error.issues[0]?.message);
  const result = await updateSeason(await createClient(), id, parsed.data, today());
  if (!result.ok) return apiError((result.code === "UNKNOWN" ? "VALIDATION" : result.code) as ErrorCode, "Could not update season", result.reason);
  return NextResponse.json({ season: result.data });
}
