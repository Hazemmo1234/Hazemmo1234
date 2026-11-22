import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, type ErrorCode } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { startReveal } from "@/modules/seasons/lifecycle";

// POST /api/seasons/:id/reveal (admin) → { season } — championship only (409 for a preseason),
// closed only. The TV switches to the reveal on its next poll and runs it from this timestamp.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return apiError("NOT_FOUND", "Season not found");
  const result = await startReveal(await createClient(), id);
  if (!result.ok) return apiError((result.code === "UNKNOWN" ? "CONFLICT" : result.code) as ErrorCode, "Could not start the reveal", result.reason);
  return NextResponse.json({ season: result.data });
}
