import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LOCALES } from "@/i18n/config";

// Admin settings (UX A7). Reads and writes go through the admin's own session, so RLS
// (admin only) and the audit triggers apply; the service role is not used.
async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: apiError("UNAUTHENTICATED", "Sign in required") } as const;
  if (profile.role !== "admin") return { error: apiError("FORBIDDEN", "Admin only") } as const;
  return { profile } as const;
}

function tvUrl(request: NextRequest, key: string) {
  return `${request.nextUrl.origin}/tv?key=${encodeURIComponent(key)}`;
}

// GET /api/settings → { gym_name, tv_locale, tv_url }
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("gym_name, tv_locale, tv_key").eq("id", 1).single();
  if (!data) return apiError("NOT_FOUND", "Settings not found");
  return NextResponse.json({ gym_name: data.gym_name, tv_locale: data.tv_locale, tv_url: tvUrl(request, data.tv_key) });
}

const patchSchema = z
  .object({ gym_name: z.string().trim().min(1).max(80).optional(), tv_locale: z.enum(LOCALES).optional() })
  .strict()
  .refine((v) => v.gym_name !== undefined || v.tv_locale !== undefined, "nothing to update");

// PATCH /api/settings { gym_name?, tv_locale? } — audited by the database (D17, D18)
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid settings");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update(parsed.data)
    .eq("id", 1)
    .select("gym_name, tv_locale, tv_key")
    .single();
  if (error || !data) return apiError("FORBIDDEN", "Could not update settings");
  return NextResponse.json({ gym_name: data.gym_name, tv_locale: data.tv_locale, tv_url: tvUrl(request, data.tv_key) });
}
