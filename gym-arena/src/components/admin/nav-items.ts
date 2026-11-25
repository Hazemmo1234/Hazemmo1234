import type { ComponentType, SVGProps } from "react";
import { AuditIcon, CalendarIcon, CoachIcon, DashboardIcon, EntriesIcon, MembersIcon, SettingsIcon } from "@/components/ui/icons";

/**
 * Admin navigation (UX section B). `ready` flips to true as each M2 screen lands, so the
 * menu never links to a page that does not exist yet; unready items show as "Soon".
 */
export type AdminNavKey = "dashboard" | "seasons" | "members" | "coaches" | "entries" | "audit" | "settings";

export interface AdminNavItem {
  key: AdminNavKey;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  ready: boolean;
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: "dashboard", href: "/admin/dashboard", icon: DashboardIcon, ready: true },
  { key: "seasons", href: "/admin/seasons", icon: CalendarIcon, ready: true },
  { key: "members", href: "/admin/members", icon: MembersIcon, ready: true },
  { key: "coaches", href: "/admin/coaches", icon: CoachIcon, ready: true },
  { key: "entries", href: "/admin/entries", icon: EntriesIcon, ready: true },
  { key: "audit", href: "/admin/audit", icon: AuditIcon, ready: true },
  { key: "settings", href: "/admin/settings", icon: SettingsIcon, ready: true },
];

export function isNavReady(key: AdminNavKey): boolean {
  return ADMIN_NAV.some((item) => item.key === key && item.ready);
}

/**
 * Phone tab bar (< 768 px): the four sections used most on the gym floor get a tab; the rest
 * sit behind "More". Seven tabs did not fit a phone (they scrolled sideways with no hint).
 */
export const PHONE_TABS: readonly AdminNavKey[] = ["dashboard", "seasons", "members", "entries"];
