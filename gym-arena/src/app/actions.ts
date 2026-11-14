"use server";

import { isLocale } from "@/i18n/config";
import { writeLocaleCookie } from "@/i18n/cookie";
import { createClient } from "@/lib/supabase/server";

/**
 * Language switcher (D16, BR-L3): remembers the choice in a cookie and, when signed
 * in, on the staff profile. The profile is the session user's own row — the ID comes
 * from the verified session, and the database lets staff change only `locale`.
 */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  await writeLocaleCookie(locale);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ locale }).eq("id", user.id);
}
