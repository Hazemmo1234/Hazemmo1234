"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { isLocalPlainHttp } from "./cookie-security";

/** Browser client — anon key only; RLS applies. Auth cookies are Secure except on local plain HTTP. */
export function createClient() {
  const { url, anonKey } = publicEnv();
  // the page's real address (not a request header): only a page actually served from this
  // machine over plain HTTP gets non-Secure cookies
  const secure = typeof window === "undefined" ? true : !isLocalPlainHttp(window.location.protocol, window.location.host);
  return createBrowserClient(url, anonKey, { cookieOptions: { secure } });
}
