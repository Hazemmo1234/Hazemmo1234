"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions";
import { LOCALES, type Locale } from "@/i18n/config";

// Each language is always written in its own script, whatever the current language.
const NATIVE_NAME: Record<Locale, string> = { ar: "العربية", en: "English" };

export function LanguageSwitcher() {
  const current = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t("language")} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocaleAction(locale);
              router.refresh(); // server re-renders with the new language and direction
            })
          }
          className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors ${
            locale === current ? "bg-brand text-white" : "text-text-muted hover:text-text"
          }`}
        >
          {NATIVE_NAME[locale]}
        </button>
      ))}
    </div>
  );
}
