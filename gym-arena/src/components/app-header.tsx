import Image from "next/image";
import { LanguageSwitcher } from "./language-switcher";
import { SignOutButton } from "./sign-out-button";

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
      <Image src="/brand/logo-tile.png" alt="DFN GYM" width={32} height={32} className="rounded-md" />
      <div className="min-w-0 flex-1 text-start">
        <p className="truncate font-bold">{title}</p>
        {subtitle && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
      </div>
      {/* phones: compact controls so the coach's name stays readable; full controls from sm up */}
      <span className="flex items-center gap-1 sm:hidden">
        <LanguageSwitcher variant="compact" />
        <SignOutButton variant="icon" />
      </span>
      <span className="hidden items-center gap-3 sm:flex">
        <LanguageSwitcher />
        <SignOutButton />
      </span>
    </header>
  );
}
