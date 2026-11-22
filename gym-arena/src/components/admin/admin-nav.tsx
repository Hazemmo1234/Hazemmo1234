"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "./nav-items";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Side navigation for iPad and desktop.
 * - md (iPad portrait, 768–1023 px): an icon rail with small labels under each icon
 * - lg (iPad landscape, desktop): a full sidebar with labels beside the icons
 */
export function AdminSideNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <ul className="flex flex-col gap-1">
      {ADMIN_NAV.map(({ key, href, icon: Icon, ready }) => {
        const active = isActive(pathname, href);
        const layout = "flex items-center rounded-xl transition-colors md:min-h-16 md:flex-col md:justify-center md:gap-1 md:px-1 lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3";
        const label = "text-[11px] font-semibold leading-tight lg:text-sm";
        if (!ready) {
          return (
            <li key={key}>
              <span aria-disabled="true" title={t("soon")} className={`${layout} cursor-default text-text-muted/50`}>
                <Icon size={22} />
                <span className={label}>{t(key)}</span>
                <span className="hidden rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold lg:ms-auto lg:inline">{t("soon")}</span>
              </span>
            </li>
          );
        }
        return (
          <li key={key}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`${layout} ${active ? "bg-brand/15 text-brand-text" : "text-text-muted hover:bg-surface-2 hover:text-text"}`}
            >
              <Icon size={22} />
              <span className={label}>{t(key)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Bottom tab bar for phones (< 768 px). Thumb-reachable, safe-area aware. With seven sections
 * the bar scrolls sideways inside itself (the page never overflows); each tab stays ≥ 44 px.
 */
export function AdminBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <ul className="flex overflow-x-auto [scrollbar-width:none]">
      {ADMIN_NAV.map(({ key, href, icon: Icon, ready }) => {
        const active = isActive(pathname, href);
        const cls = "flex min-h-16 min-w-[4.75rem] flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold";
        return (
          <li key={key} className="flex-1">
            {ready ? (
              <Link href={href} aria-current={active ? "page" : undefined} className={`${cls} ${active ? "text-brand-text" : "text-text-muted"}`}>
                <Icon size={22} />
                <span className="max-w-full truncate">{t(key)}</span>
              </Link>
            ) : (
              <span aria-disabled="true" title={t("soon")} className={`${cls} text-text-muted/40`}>
                <Icon size={22} />
                <span className="max-w-full truncate">{t(key)}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
