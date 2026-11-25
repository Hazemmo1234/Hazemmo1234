import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { reassignMemberSchema } from "@/lib/validation/members";
import { reassignMember } from "@/modules/members/service";
import { memberError, memberResponse, uuid } from "../../_shared";

// POST /api/members/:id/reassign (admin) { coach_id } — audited; target must be an active coach
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return apiError("NOT_FOUND", "Member not found");
  const parsed = reassignMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid coach", parsed.error.issues[0]?.message);
  const client = await createClient();
  const result = await reassignMember(client, id, parsed.data.coach_id);
  if (!result.ok) return memberError(result, "Could not reassign member");
  return memberResponse(client, id); // API_SPECIFICATION: returns the member
}
