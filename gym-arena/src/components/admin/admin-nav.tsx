"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { ChevronIcon, MoreIcon } from "@/components/ui/icons";
import { ADMIN_NAV, PHONE_TABS } from "./nav-items";

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
 * Bottom tab bar for phones (< 768 px). Thumb-reachable, safe-area aware. Four tabs plus
 * "More", which opens a sheet with the remaining sections, so every section is one or two taps
 * away and nothing hides off-screen. Each tab is ≥ 44 px (AC-32).
 */
export function AdminBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const c = useTranslations("common");
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = ADMIN_NAV.filter((item) => PHONE_TABS.includes(item.key));
  const more = ADMIN_NAV.filter((item) => !PHONE_TABS.includes(item.key));
  const moreActive = more.some((item) => isActive(pathname, item.href));
  const cls = "flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors";
  return (
    <>
      <ul className="grid grid-cols-5">
        {tabs.map(({ key, href, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={key} className="min-w-0">
              <Link href={href} aria-current={active ? "page" : undefined} className={`${cls} ${active ? "text-brand-text" : "text-text-muted"}`}>
                <Icon size={22} />
                <span className="max-w-full truncate">{t(key)}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
            className={`${cls} ${moreActive ? "text-brand-text" : "text-text-muted"}`}
          >
            <MoreIcon size={22} />
            <span className="max-w-full truncate">{t("more")}</span>
          </button>
        </li>
      </ul>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t("more")} closeLabel={c("close")}>
        <ul className="-mx-2 flex flex-col gap-1" data-testid="more-sheet">
          {more.map(({ key, href, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={key}>
                <Link
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold transition-colors ${active ? "bg-brand/15 text-brand-text" : "text-text hover:bg-surface-2"}`}
                >
                  <Icon size={22} />
                  <span className="min-w-0 flex-1">{t(key)}</span>
                  <ChevronIcon size={18} className="text-text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
