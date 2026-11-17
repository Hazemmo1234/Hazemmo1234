import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { createMemberSchema } from "@/lib/validation/members";
import { createMember, listMembers } from "@/modules/members/service";
import { memberError } from "./_shared";

const listQuery = z.object({
  q: z.string().max(60).optional(),
  coach_id: z.guid().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// GET /api/members?q=&coach_id=&status= (admin: all; coach: own clients only — RLS)
export async function GET(request: NextRequest) {
  const auth = await requireRole("admin", "coach");
  if ("error" in auth) return auth.error;
  const parsed = listQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("VALIDATION", "Invalid filters");
  const members = await listMembers(await createClient(), parsed.data, today());
  return NextResponse.json({ members });
}

// POST /api/members (admin, coach) — coach_id forced to self for coaches (AC-5)
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin", "coach");
  if ("error" in auth) return auth.error;
  const parsed = createMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid member", parsed.error.issues[0]?.message);
  const result = await createMember(await createClient(), auth.profile, parsed.data, today());
  if (!result.ok) return memberError(result, "Could not create member");
  return NextResponse.json({ member: result.data }, { status: 201 });
}
