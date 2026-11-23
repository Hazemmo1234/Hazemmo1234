import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, type Locale } from "@/i18n/config";
import { SESSION_AWARE_PUBLIC, decideAccess, routeArea, type Viewer } from "@/lib/routes";
import { authCookieSecure, processCookieTrust } from "@/lib/supabase/cookie-security";
import type { UserRole } from "@/lib/supabase/types";

/**
 * Session refresh + role-based route groups (SYSTEM_ARCHITECTURE "Security").
 * RLS remains the source of truth; this only routes people to the right area.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return new NextResponse("Server misconfigured", { status: 500 });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    // auth cookies are Secure; local plain HTTP is exempt only when the server config allows it
    cookieOptions: { secure: authCookieSecure(request.nextUrl.protocol, request.nextUrl.host, processCookieTrust()) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { pathname } = request.nextUrl;
  // TV / cron are authenticated by key/secret in their handlers, not by session.
  if (routeArea(pathname) === "public" && !SESSION_AWARE_PUBLIC.some((p) => pathname.startsWith(p))) return response;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  let viewer: Viewer | null = null;
  let inactive = false;
  // D28 / AC-49: a deactivated coach's existing session is rejected by Supabase Auth
  // (user_banned). Clear the dead session cookies on this device and say why.
  if (!user && userError?.code === "user_banned") {
    inactive = true;
    await supabase.auth.signOut({ scope: "local" });
  }
  let syncLocale: Locale | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active, locale")
      .eq("id", user.id)
      .maybeSingle<{ role: UserRole; is_active: boolean; locale: string }>();
    if (profile?.is_active) {
      viewer = { role: profile.role, isActive: true };
      // BR-L3: the profile's language wins over the device cookie. Sync the cookie so
      // this very request already renders in the staff member's language.
      if (isLocale(profile.locale) && request.cookies.get(LOCALE_COOKIE)?.value !== profile.locale) {
        syncLocale = profile.locale;
        request.cookies.set(LOCALE_COOKIE, profile.locale);
        const refreshed = NextResponse.next({ request });
        response.cookies.getAll().forEach((c) => refreshed.cookies.set(c));
        response = refreshed;
      }
    } else {
      // AC-1 / BR-P7: inactive (or profile-less) users are signed out
      inactive = true;
      await supabase.auth.signOut();
    }
  }

  const localeCookie = { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" as const };
  if (syncLocale) response.cookies.set(LOCALE_COOKIE, syncLocale, localeCookie);

  const decision = decideAccess(pathname, viewer);
  if (decision.kind === "allow") return response;
  if (decision.kind === "unauthorized") {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
      { status: 401, headers: response.headers },
    );
  }
  const target = request.nextUrl.clone();
  target.pathname = decision.to;
  target.search = inactive && decision.to === "/login" ? "?error=inactive" : "";
  const redirect = NextResponse.redirect(target);
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
