import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { voidEntrySchema } from "@/lib/validation/entries";
import { voidEntryFor } from "@/modules/entries/service";
import { entryError, staffOr401 } from "../../_shared";

// POST /api/entries/:id/void (admin until close; coach: entries THEY submitted, same day — BR-E9, D26)
// { reason } — required for the admin → { ok, member_card }. Nothing is deleted (BR-E8); audited (BR-E11).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await staffOr401();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return apiError("NOT_FOUND", "Entry not found");
  const parsed = voidEntrySchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return apiError("VALIDATION", "Invalid reason");
  const result = await voidEntryFor(await createClient(), auth.staff, id, parsed.data.reason, today());
  if (!result.ok) return entryError(result, "Could not undo the entry");
  return NextResponse.json({ ok: true, member_card: result.data.member_card });
}
