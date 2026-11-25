import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, type ErrorCode } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { closeSeason } from "@/modules/seasons/close";
import { closeEligibility, closePreview } from "@/modules/seasons/lifecycle";

const code = (c: ErrorCode | "UNKNOWN"): ErrorCode => (c === "UNKNOWN" ? "CONFLICT" : c);

// GET /api/seasons/:id/close (admin) → the confirmation summary (provisional top 3, counts).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return apiError("NOT_FOUND", "Season not found");
  const result = await closePreview(await createClient(), id, today());
  if (!result.ok) return apiError(code(result.code), "Could not prepare the close", result.reason);
  return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/seasons/:id/close (admin) → { season_id, type, closed_at, results, winners }.
// 409 CONFLICT (not_ended) unless today > ends_on; 409 SEASON_CLOSED if already closed.
// Atomic and recomputed on the server inside one transaction under the season lock (D21).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!staff) return apiError("UNAUTHENTICATED", "Sign in required");
  if (staff.role !== "admin") return apiError("FORBIDDEN", "Admin only");
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return apiError("NOT_FOUND", "Season not found");
  const eligible = await closeEligibility(await createClient(), id, today());
  if (!eligible.ok) return apiError(code(eligible.code), "Could not close the season", eligible.reason);
  const result = await closeSeason(staff, id);
  if (!result.ok) {
    if (result.reason === "close_not_configured" || result.reason === "close_failed") {
      return NextResponse.json({ error: { code: "UNKNOWN", message: "Season close is unavailable", reason: result.reason } }, { status: 503 });
    }
    return apiError(code(result.code), "Could not close the season", result.reason);
  }
  return NextResponse.json(result.data);
}
