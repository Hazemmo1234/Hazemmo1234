import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { evidencePhotoUrl } from "@/modules/entries/admin";
import { staffOr401 } from "../../_shared";

// GET /api/entries/:id/photo (admin; coach of that member) → { url } — a 2-minute signed URL
// for the private evidence photo (BR-X3). RLS on the caller's own read decides access.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return apiError("NOT_FOUND", "Entry not found");
  const url = await evidencePhotoUrl(await createClient(), id);
  if (!url) return apiError("NOT_FOUND", "No photo");
  return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
}
