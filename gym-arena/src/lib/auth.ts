import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Current staff profile. The identity comes from `auth.getUser()`, which verifies the
 * session with the Auth server — never from cookies read as-is and never from anything
 * the client sends (SECURITY_SPECIFICATION §1, D19). Null when signed out or inactive.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  return data?.is_active ? data : null;
}

declare const verifiedStaff: unique symbol;
/**
 * A staff identity that can only be produced by `requireStaff()`. Server-only write
 * functions accept this type instead of a plain user ID, so an ID taken from a request
 * body cannot be passed to them by mistake (AC-40).
 */
export type VerifiedStaff = Pick<Profile, "id" | "role" | "full_name" | "locale"> & { readonly [verifiedStaff]: true };

export async function requireStaff(): Promise<VerifiedStaff | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  return { id: profile.id, role: profile.role, full_name: profile.full_name, locale: profile.locale } as VerifiedStaff;
}
