import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, type ErrorCode } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { updateCoachSchema } from "@/lib/validation/coaches";
import { deactivateCoach, reactivateCoach, renameCoach } from "@/modules/coaches/service";

const code = (c: ErrorCode | "UNKNOWN"): ErrorCode => (c === "UNKNOWN" ? "VALIDATION" : c);

// PATCH /api/coaches/:id (admin) { full_name?, is_active? }
// Deactivation is blocked while the coach has active clients (BR-P7, enforced by the
// database) and also blocks sign-in and ends sessions at the Auth level (D28).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError("NOT_FOUND", "Coach not found");
  const parsed = updateCoachSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid update", parsed.error.issues[0]?.message);

  const admin = await createClient();
  if (parsed.data.full_name !== undefined) {
    const renamed = await renameCoach(admin, id, parsed.data.full_name);
    if (!renamed.ok) return apiError(code(renamed.code), "Could not rename coach", renamed.reason);
  }
  if (parsed.data.is_active !== undefined) {
    const result = parsed.data.is_active ? await reactivateCoach(admin, id) : await deactivateCoach(admin, id);
    if (!result.ok) {
      if (result.reason === "auth_sync_failed") {
        return NextResponse.json({ error: { code: "AUTH_SYNC_FAILED", message: "Sign-in status could not be updated", reason: "auth_sync_failed" } }, { status: 502 });
      }
      return apiError(code(result.code), "Could not change coach status", result.reason);
    }
  }
  return NextResponse.json({ ok: true });
}
