import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess, routeArea, type Viewer } from "@/lib/routes";
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
  if (routeArea(pathname) === "public" && !pathname.startsWith("/login")) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let viewer: Viewer | null = null;
  let inactive = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle<{ role: UserRole; is_active: boolean }>();
    if (profile?.is_active) {
      viewer = { role: profile.role, isActive: true };
    } else {
      // AC-1 / BR-P7: inactive (or profile-less) users are signed out
      inactive = true;
      await supabase.auth.signOut();
    }
  }

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
