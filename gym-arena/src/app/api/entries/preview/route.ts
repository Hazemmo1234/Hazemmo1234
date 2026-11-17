import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { previewEntrySchema } from "@/lib/validation/entries";
import { previewForMember } from "@/modules/entries/service";
import { entryError, staffOr401 } from "../_shared";

// POST /api/entries/preview (admin, coach own) { member_id, category, weight_kg?, reps?, km? }
// → { value, is_new_best, points_before, points_after, points_delta, total_after, photo_required }
// Computed by modules/scoring on the member's stored history — the same code the save uses.
export async function POST(request: NextRequest) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  const parsed = previewEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid entry", parsed.error.issues[0]?.message);
  const result = await previewForMember(await createClient(), auth.staff, parsed.data, today());
  if (!result.ok) return entryError(result, "Cannot preview this entry");
  return NextResponse.json(result.data);
}
