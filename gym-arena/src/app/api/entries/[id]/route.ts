import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { editEntrySchema } from "@/lib/validation/entries";
import { correctEntry, getAdminEntry } from "@/modules/entries/admin";
import { entryError, staffOr401 } from "../_shared";

// GET /api/entries/:id (admin) — one entry as the A5 log shows it.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  if (auth.staff.role !== "admin") return apiError("FORBIDDEN", "Admin only");
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return apiError("NOT_FOUND", "Entry not found");
  const row = await getAdminEntry(await createClient(), id);
  return row ? NextResponse.json(row) : apiError("NOT_FOUND", "Entry not found");
}

// PATCH /api/entries/:id (admin, until close) { weight_kg?, reps?, km?, performed_on?, reason }
// → entry. The reason is required (422 without it — AC-47); the value is recomputed and the
// change audited with before/after and the reason by the database (BR-E9, BR-E11).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  if (auth.staff.role !== "admin") return apiError("FORBIDDEN", "Admin only");
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return apiError("NOT_FOUND", "Entry not found");
  const parsed = editEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid correction", parsed.error.issues[0]?.message);
  const result = await correctEntry(await createClient(), auth.staff, id, parsed.data, today());
  if (!result.ok) return entryError(result, "Could not correct the entry");
  return NextResponse.json(result.data);
}
