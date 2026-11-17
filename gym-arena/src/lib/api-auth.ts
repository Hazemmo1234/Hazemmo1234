import "server-only";

import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getCurrentProfile } from "@/lib/auth";
import type { Profile, UserRole } from "@/lib/supabase/types";

/**
 * Route-handler guard: the caller comes from the verified session (never the request
 * body). Returns the profile, or a ready 401/403 response. RLS still applies to every
 * query the handler makes with the user's own client.
 */
export async function requireRole(...roles: UserRole[]): Promise<{ profile: Profile } | { error: NextResponse }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: apiError("UNAUTHENTICATED", "Sign in required") };
  if (!roles.includes(profile.role)) return { error: apiError("FORBIDDEN", "Not allowed for this role") };
  return { profile };
}
