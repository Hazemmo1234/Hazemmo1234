import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { avatarUploadSchema } from "@/lib/validation/members";
import { avatarUploadUrl } from "@/modules/members/service";
import { memberError } from "../../members/_shared";

// POST /api/uploads/avatar (admin, coach own) { member_id, content_type } → { path, token }
// A one-file signed upload into members/{member_id}/; the photo is attached afterwards
// with PATCH /api/members/:id { photo_path } (decision 4 ordering).
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin", "coach");
  if ("error" in auth) return auth.error;
  const parsed = avatarUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid upload request");
  const result = await avatarUploadUrl(await createClient(), parsed.data.member_id, parsed.data.content_type);
  if (!result.ok) return memberError(result, "Could not prepare upload");
  return NextResponse.json(result.data);
}
