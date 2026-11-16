import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { evidenceUploadSchema } from "@/lib/validation/entries";
import { evidenceUploadUrl } from "@/modules/entries/service";
import { entryError, staffOr401 } from "../../entries/_shared";

// POST /api/uploads/evidence (admin, coach own) { member_id, content_type } → { path, token }
// One signed upload into the private evidence bucket, entries/{season}/{member}/ (BR-X3).
export async function POST(request: NextRequest) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  const parsed = evidenceUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid upload request");
  const result = await evidenceUploadUrl(await createClient(), parsed.data.member_id, parsed.data.content_type, today());
  if (!result.ok) return entryError(result, "Could not prepare upload");
  return NextResponse.json(result.data);
}
