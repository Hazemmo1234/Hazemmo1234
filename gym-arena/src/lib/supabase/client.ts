"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { authCookieSecure } from "./cookie-security";

/** Browser client — anon key only; RLS applies. Auth cookies are Secure except on local plain HTTP. */
export function createClient() {
  const { url, anonKey } = publicEnv();
  const secure = typeof window === "undefined" ? true : authCookieSecure(window.location.protocol, window.location.host);
  return createBrowserClient(url, anonKey, { cookieOptions: { secure } });
}
