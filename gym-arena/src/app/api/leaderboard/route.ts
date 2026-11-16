import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { getLeaderboard } from "@/modules/leaderboard/service";
import { entryError, staffOr401 } from "../entries/_shared";

export const dynamic = "force-dynamic";

// GET /api/leaderboard?season_id= (admin, coach) → { season, main: Row[], rookies: Row[] }
// Row = { rank, member_id, own, full_name, photo_url, coach_name, is_rookie, total, total_display,
//         improvement_points, categories } — no phones, codes, raw results or evidence.
// Without season_id: the season running today ({ season: null, … } when none).
export async function GET(request: NextRequest) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  const raw = request.nextUrl.searchParams.get("season_id") ?? undefined;
  if (raw !== undefined && !z.guid().safeParse(raw).success) return apiError("NOT_FOUND", "Season not found");
  const result = await getLeaderboard(await createClient(), { id: auth.staff.id, role: auth.staff.role }, raw, today());
  if (!result.ok) return entryError(result, "Cannot load the leaderboard");
  return NextResponse.json(result.data ?? { season: null, main: [], rookies: [] });
}
