import { describe, expect, it } from "vitest";
import { decideAccess, routeArea } from "@/lib/routes";

const coach = { role: "coach" as const, isActive: true };
const admin = { role: "admin" as const, isActive: true };

describe("route access (USER_ROLES, AC-1, AC-2)", () => {
  it("classifies areas", () => {
    expect(routeArea("/tv")).toBe("public");
    expect(routeArea("/api/tv/state")).toBe("public");
    expect(routeArea("/admin/seasons")).toBe("admin");
    expect(routeArea("/members/123")).toBe("coach");
    expect(routeArea("/api/me")).toBe("api");
    expect(routeArea("/")).toBe("root");
    expect(routeArea("/administrator")).toBe("other");
  });

  it("unauthenticated → /login (pages) or 401 (api)", () => {
    expect(decideAccess("/today", null)).toEqual({ kind: "redirect", to: "/login" });
    expect(decideAccess("/admin/dashboard", null)).toEqual({ kind: "redirect", to: "/login" });
    expect(decideAccess("/api/me", null)).toEqual({ kind: "unauthorized" });
  });

  it("AC-1: inactive accounts are treated as signed out", () => {
    expect(decideAccess("/today", { role: "coach", isActive: false })).toEqual({ kind: "redirect", to: "/login" });
  });

  it("AC-2: coach opening /admin is redirected to /today", () => {
    expect(decideAccess("/admin/dashboard", coach)).toEqual({ kind: "redirect", to: "/today" });
    expect(decideAccess("/admin", coach)).toEqual({ kind: "redirect", to: "/today" });
  });

  it("admin routes for admin, coach routes for coaches", () => {
    expect(decideAccess("/admin/seasons", admin)).toEqual({ kind: "allow" });
    expect(decideAccess("/today", coach)).toEqual({ kind: "allow" });
    expect(decideAccess("/today", admin)).toEqual({ kind: "redirect", to: "/admin/dashboard" });
  });

  it("root and login redirect signed-in staff home", () => {
    expect(decideAccess("/", coach)).toEqual({ kind: "redirect", to: "/today" });
    expect(decideAccess("/", admin)).toEqual({ kind: "redirect", to: "/admin/dashboard" });
    expect(decideAccess("/login", admin)).toEqual({ kind: "redirect", to: "/admin/dashboard" });
  });

  it("TV is public without a session; signed-in api calls pass through", () => {
    expect(decideAccess("/tv", null)).toEqual({ kind: "allow" });
    expect(decideAccess("/login", null)).toEqual({ kind: "allow" });
    expect(decideAccess("/api/me", coach)).toEqual({ kind: "allow" });
  });
});
