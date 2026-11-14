import type { ComponentType, SVGProps } from "react";
import { CalendarIcon, CoachIcon, DashboardIcon, MembersIcon, SettingsIcon } from "@/components/ui/icons";

/**
 * Admin navigation (UX section B). `ready` flips to true as each M2 screen lands, so the
 * menu never links to a page that does not exist yet; unready items show as "Soon".
 * Entries (A5, M3) and Audit log (A6, M6) are added when their milestones ship.
 */
export type AdminNavKey = "dashboard" | "seasons" | "members" | "coaches" | "settings";

export interface AdminNavItem {
  key: AdminNavKey;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  ready: boolean;
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: "dashboard", href: "/admin/dashboard", icon: DashboardIcon, ready: true },
  { key: "seasons", href: "/admin/seasons", icon: CalendarIcon, ready: false },
  { key: "members", href: "/admin/members", icon: MembersIcon, ready: false },
  { key: "coaches", href: "/admin/coaches", icon: CoachIcon, ready: false },
  { key: "settings", href: "/admin/settings", icon: SettingsIcon, ready: false },
];

export function isNavReady(key: AdminNavKey): boolean {
  return ADMIN_NAV.some((item) => item.key === key && item.ready);
}
