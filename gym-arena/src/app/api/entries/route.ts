import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { createEntrySchema, entriesQuerySchema } from "@/lib/validation/entries";
import { listEntries } from "@/modules/entries/admin";
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

// GET /api/entries (admin) ?season_id=&member_id=&coach_id=&category=&date=&q=&include_voided=&page=
// → { rows, page, pages, total } — the A5 log, read with the admin's own client (RLS).
export async function GET(request: NextRequest) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  if (auth.staff.role !== "admin") return apiError("FORBIDDEN", "Admin only");
  const parsed = entriesQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("VALIDATION", "Invalid filters");
  try {
    return NextResponse.json(await listEntries(await createClient(), parsed.data));
  } catch {
    return apiError("VALIDATION", "Could not read entries");
  }
}
