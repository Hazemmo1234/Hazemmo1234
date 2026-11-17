import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { attendanceSchema } from "@/lib/validation/entries";
import { markAttendance } from "@/modules/entries/service";
import { entryError, staffOr401 } from "../entries/_shared";

// POST /api/attendance (admin, coach own) { member_id } → { ok, member_card }; 409 if already today (BR-E2, BR-E7)
export async function POST(request: NextRequest) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  const parsed = attendanceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid member");
  const result = await markAttendance(await createClient(), auth.staff, parsed.data.member_id, today());
  if (!result.ok) return entryError(result, "Could not record attendance");
  return NextResponse.json({ ok: true, member_card: result.data.member_card });
}
