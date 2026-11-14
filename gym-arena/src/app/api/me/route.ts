import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeLocaleCookie } from "@/i18n/cookie";
import { apiError } from "@/lib/api";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LOCALES } from "@/i18n/config";

// API_SPECIFICATION: GET /api/me → { id, full_name, role, locale }
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return apiError("UNAUTHENTICATED", "Sign in required");
  return NextResponse.json({ id: profile.id, full_name: profile.full_name, role: profile.role, locale: profile.locale });
}

const patchSchema = z.object({ locale: z.enum(LOCALES) }).strict();

// PATCH /api/me { locale } — only `locale` is editable (D16). The row updated is the
// session user's own; no user ID is accepted from the request.
export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return apiError("UNAUTHENTICATED", "Sign in required");
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "locale must be 'ar' or 'en'");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ locale: parsed.data.locale }).eq("id", profile.id);
  if (error) return apiError("FORBIDDEN", "Could not update language");
  await writeLocaleCookie(parsed.data.locale);
  return NextResponse.json({ id: profile.id, full_name: profile.full_name, role: profile.role, locale: parsed.data.locale });
}
