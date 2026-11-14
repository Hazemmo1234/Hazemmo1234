import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { initials } from "@/lib/initials";
import { AdminBottomNav, AdminSideNav } from "./admin-nav";

/**
 * Admin frame (UX section B — desktop + mobile-friendly):
 * - phone: top bar + bottom tab bar
 * - iPad portrait (md): icon rail on the start side
 * - iPad landscape / desktop (lg): full sidebar on the start side
 * The start side is the right in Arabic and the left in English (logical CSS only).
 */
export async function AdminShell({ fullName, children }: { fullName: string; children: ReactNode }) {
  const [t, c] = await Promise.all([getTranslations("nav"), getTranslations("common")]);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-24 shrink-0 flex-col border-e border-border bg-surface md:flex lg:w-64">
        <Link href="/admin/dashboard" className="flex items-center gap-3 px-4 py-5 md:justify-center lg:justify-start">
          <Image src="/brand/logo-tile.png" alt="DFN GYM" width={40} height={40} className="rounded-lg" priority />
          <span className="hidden min-w-0 lg:block">
            <span className="display block text-lg uppercase leading-none">{c("appName")}</span>
            <span className="mt-1 block text-xs text-text-muted">{t("adminArea")}</span>
          </span>
        </Link>
        <nav aria-label={t("label")} className="flex-1 overflow-y-auto px-2 lg:px-3">
          <AdminSideNav />
        </nav>
        <div className="border-t border-border p-3">
          <div className="hidden items-center gap-3 px-1 pb-3 lg:flex">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-sm font-bold text-brand-text">{initials(fullName)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{fullName}</span>
              <span className="block text-xs text-text-muted">{t("role")}</span>
            </span>
          </div>
          <div className="hidden lg:flex lg:flex-col lg:gap-2">
            <LanguageSwitcher />
            <SignOutButton />
          </div>
          <div className="flex flex-col items-center gap-2 lg:hidden">
            <LanguageSwitcher variant="compact" />
            <SignOutButton variant="icon" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
          <Image src="/brand/logo-tile.png" alt="DFN GYM" width={32} height={32} className="rounded-md" />
          <span className="min-w-0 flex-1">
            <span className="display block truncate text-base uppercase leading-none">{c("appName")}</span>
            <span className="block truncate text-xs text-text-muted">{fullName}</span>
          </span>
          <LanguageSwitcher variant="compact" />
          <SignOutButton variant="icon" />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10 lg:px-10 lg:pt-8">{children}</main>

        <nav aria-label={t("label")} className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <AdminBottomNav />
        </nav>
      </div>
    </div>
  );
}
