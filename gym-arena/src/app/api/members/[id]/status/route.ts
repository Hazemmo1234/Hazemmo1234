import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { memberStatusSchema } from "@/lib/validation/members";
import { setMemberStatus } from "@/modules/members/service";
import { memberError, memberResponse, uuid } from "../../_shared";

// POST /api/members/:id/status (admin) { status, coach_id? } — audited (BR-P5)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return apiError("NOT_FOUND", "Member not found");
  const parsed = memberStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid status");
  const client = await createClient();
  const result = await setMemberStatus(client, id, parsed.data.status, parsed.data.coach_id);
  if (!result.ok) return memberError(result, "Could not change status");
  return memberResponse(client, id); // API_SPECIFICATION: returns the member
}
