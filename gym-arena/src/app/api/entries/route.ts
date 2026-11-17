import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { createEntrySchema } from "@/lib/validation/entries";
import { createEntry } from "@/modules/entries/service";
import { entryError, staffOr401 } from "./_shared";

// POST /api/entries (admin, coach own) { member_id, category, weight_kg?, reps?, km?, photo_path?, performed_on? (admin) }
// → 201 { entry, member_card }. Server rules (API_SPECIFICATION): caller may act on the member;
// member active and a season open today; shape per category; one per category per day;
// photo rule (SCORING §6) → 422 PHOTO_REQUIRED; entry + auto attendance in one DB transaction.
export async function POST(request: NextRequest) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  const parsed = createEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid entry", parsed.error.issues[0]?.message);
  const result = await createEntry(await createClient(), auth.staff, parsed.data, today());
  if (!result.ok) return entryError(result, "Could not save the entry");
  return NextResponse.json(result.data, { status: 201 });
}
