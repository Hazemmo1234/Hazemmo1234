import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { authCookieSecure } from "./cookie-security";

/** Server client acting as the signed-in user (RLS applies). Auth cookies are Secure except on local plain HTTP. */
export async function createClient() {
  const { url, anonKey } = publicEnv();
  const cookieStore = await cookies();
  const h = await headers();
  const secure = authCookieSecure(h.get("x-forwarded-proto"), h.get("x-forwarded-host") ?? h.get("host"));
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
