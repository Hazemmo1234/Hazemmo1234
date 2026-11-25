import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { authCookieSecure, processCookieTrust } from "./cookie-security";

/**
 * Server client acting as the signed-in user (RLS applies). Auth cookies are Secure except for a
 * local plain-HTTP request on a server whose own config allows it (cookie-security.ts).
 */
export async function createClient() {
  const { url, anonKey } = publicEnv();
  const cookieStore = await cookies();
  const secure = authCookieSecure(await headers(), processCookieTrust());
  return createServerClient(url, anonKey, {
    cookieOptions: { secure },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — middleware refreshes the session instead.
        }
      },
    },
  });
}
