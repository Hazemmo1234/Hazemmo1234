import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { memberPlanSchema } from "@/lib/validation/members";
import { setPlan } from "@/modules/members/service";
import { memberError, uuid } from "../../_shared";

// PATCH /api/members/:id/plan (admin, coach own) { planned_sessions } — active season (BR-P4)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "coach");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return apiError("NOT_FOUND", "Member not found");
  const parsed = memberPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid plan", "invalid_plan");
  const result = await setPlan(await createClient(), id, parsed.data.planned_sessions, today());
  if (!result.ok) return memberError(result, "Could not update plan");
  return NextResponse.json({ participant: result.data });
}
