import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { requestOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { LOCALES } from "@/i18n/config";
import { getSettings, updateSettings } from "@/modules/settings/service";

// Admin settings (UX A7). Reads and writes go through the admin's own session, so RLS
// (admin only) and the audit triggers apply; the service role is not used.

// GET /api/settings → { gym_name, tv_locale, tv_url }
export async function GET() {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const settings = await getSettings(await createClient(), await requestOrigin());
  if (!settings) return apiError("NOT_FOUND", "Settings not found");
  return NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
}

const patchSchema = z
  .object({ gym_name: z.string().trim().min(1).max(80).optional(), tv_locale: z.enum(LOCALES).optional() })
  .strict()
  .refine((v) => v.gym_name !== undefined || v.tv_locale !== undefined, "nothing to update");

// PATCH /api/settings { gym_name?, tv_locale? } — audited by the database (D17, D18)
export async function PATCH(request: NextRequest) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid settings");
  const settings = await updateSettings(await createClient(), parsed.data, await requestOrigin());
  if (!settings) return apiError("FORBIDDEN", "Could not update settings");
  return NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
}
