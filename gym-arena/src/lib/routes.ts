import type { UserRole } from "@/lib/supabase/types";

/** Route access rules used by middleware (USER_ROLES, AC-2). Pure for unit testing. */
export const HOME_BY_ROLE: Record<UserRole, string> = {
  admin: "/admin/dashboard",
  coach: "/today",
};

const COACH_PREFIXES = ["/today", "/members", "/leaderboard", "/history"];
/** Public paths: login, TV (key-protected in its own handler), cron (secret), static assets. */
const PUBLIC_PREFIXES = ["/login", "/tv", "/api/tv", "/api/cron", "/brand", "/manifest.webmanifest"];

export type RouteArea = "public" | "admin" | "coach" | "api" | "root" | "other";

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function routeArea(pathname: string): RouteArea {
  if (PUBLIC_PREFIXES.some((p) => matches(pathname, p))) return "public";
  if (pathname === "/") return "root";
  if (matches(pathname, "/admin")) return "admin";
  if (COACH_PREFIXES.some((p) => matches(pathname, p))) return "coach";
  if (matches(pathname, "/api")) return "api";
  return "other";
}

export type AccessDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "unauthorized" };

export interface Viewer {
  role: UserRole;
  isActive: boolean;
}

/**
 * Decide access for a request. `viewer` is null when there is no session or no profile.
 * Inactive profiles are handled by the caller (signed out) and treated as null here.
 */
export function decideAccess(pathname: string, viewer: Viewer | null): AccessDecision {
  const area = routeArea(pathname);
  if (area === "public") {
    if (matches(pathname, "/login") && viewer?.isActive) return { kind: "redirect", to: HOME_BY_ROLE[viewer.role] };
    return { kind: "allow" };
  }
  if (!viewer || !viewer.isActive) {
    return area === "api" ? { kind: "unauthorized" } : { kind: "redirect", to: "/login" };
  }
  switch (area) {
    case "root":
      return { kind: "redirect", to: HOME_BY_ROLE[viewer.role] };
    case "admin": // AC-2: coaches opening /admin go to /today
      return viewer.role === "admin" ? { kind: "allow" } : { kind: "redirect", to: HOME_BY_ROLE.coach };
    case "coach":
      return viewer.role === "coach" ? { kind: "allow" } : { kind: "redirect", to: HOME_BY_ROLE.admin };
    default:
      return { kind: "allow" };
  }
}
