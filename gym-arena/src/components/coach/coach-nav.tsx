"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ActivityIcon, MembersIcon } from "@/components/ui/icons";

const ITEMS = [
  { href: "/today", key: "today", icon: MembersIcon, match: (p: string) => p === "/today" || p.startsWith("/members") },
  { href: "/today/activity", key: "activity", icon: ActivityIcon, match: (p: string) => p.startsWith("/today/activity") },
] as const;

/** Coach tab bar: bottom of the screen on phones (one-handed use), start side on iPad+. */
export function CoachNav() {
  const t = useTranslations("coach.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:top-0 md:h-dvh md:w-24 md:border-e md:border-t-0 md:pb-0">
      <ul className="mx-auto flex max-w-md md:max-w-none md:flex-col md:gap-2 md:px-2 md:pt-24">
        {ITEMS.map(({ href, key, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={key} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors md:min-h-16 ${active ? "text-brand-text" : "text-text-muted hover:text-text"}`}
              >
                <Icon size={22} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
