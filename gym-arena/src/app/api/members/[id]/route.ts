import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { updateMemberSchema } from "@/lib/validation/members";
import { memberCard } from "@/modules/entries/service";
import { getMember, updateMember } from "@/modules/members/service";
import { memberError, memberResponse, uuid } from "../_shared";

type Params = { params: Promise<{ id: string }> };

// GET /api/members/:id (admin, coach own) — profile, photo, coach history, current plan, season card
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireRole("admin", "coach");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return apiError("NOT_FOUND", "Member not found");
  const client = await createClient();
  const day = today();
  const member = await getMember(client, id, day);
  if (!member) return apiError("NOT_FOUND", "Member not found"); // also another coach's client (AC-3)
  // API_SPECIFICATION: member + current season card (M3) — computed by modules/scoring
  const card = await memberCard(client, auth.profile.id, id, day);
  return NextResponse.json({ member, card });
}

// PATCH /api/members/:id (admin, coach own) { full_name?, phone?, photo_consent?, photo_path? }
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireRole("admin", "coach");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return apiError("NOT_FOUND", "Member not found");
  const parsed = updateMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid update", parsed.error.issues[0]?.message);
  const client = await createClient();
  const result = await updateMember(client, auth.profile, id, parsed.data);
  if (!result.ok) return memberError(result, "Could not update member");
  return memberResponse(client, id); // API_SPECIFICATION: returns the member
}
