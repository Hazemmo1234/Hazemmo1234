import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { writeLocaleCookie } from "@/i18n/cookie";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ locale: z.enum(LOCALES) }).strict();

/**
 * Language switcher endpoint (D16, BR-L3). Works signed out (cookie only, e.g. the login
 * page) and signed in (cookie + the session user's own profile). A route handler, not a
 * server action: a server action that sets a cookie triggers its own re-render, which
 * raced with the client's refresh and could leave the old language on screen.
 */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "locale must be 'ar' or 'en'");
  const { locale } = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { error } = await supabase.from("profiles").update({ locale }).eq("id", user.id);
    if (error) return apiError("FORBIDDEN", "Could not update language");
  }
  await writeLocaleCookie(locale);
  return NextResponse.json({ locale });
}
