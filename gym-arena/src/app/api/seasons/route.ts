import { NextResponse, type NextRequest } from "next/server";
import { apiError, type ErrorCode } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { createSeasonSchema } from "@/lib/validation/seasons";
import { createSeason, listSeasons } from "@/modules/seasons/service";

// GET /api/seasons (admin, coach) → list with derived status
export async function GET() {
  const auth = await requireRole("admin", "coach");
  if ("error" in auth) return auth.error;
  const seasons = await listSeasons(await createClient(), today());
  return NextResponse.json({ seasons });
}

// POST /api/seasons (admin) { name, type, starts_on, ends_on } → season (creates participants)
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const parsed = createSeasonSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid season", parsed.error.issues[0]?.message);
  const result = await createSeason(await createClient(), parsed.data);
  if (!result.ok) return apiError((result.code === "UNKNOWN" ? "VALIDATION" : result.code) as ErrorCode, "Could not create season", result.reason);
  return NextResponse.json({ season: result.data }, { status: 201 });
}
