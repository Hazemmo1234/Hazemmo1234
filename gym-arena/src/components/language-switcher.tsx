"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LOCALES, type Locale } from "@/i18n/config";

// Each language is always written in its own script, whatever the current language.
const NATIVE_NAME: Record<Locale, string> = { ar: "العربية", en: "English" };
const SHORT_NAME: Record<Locale, string> = { ar: "عربي", en: "EN" };

/**
 * `full` = segmented control (login, sidebar); `compact` = one button that switches to
 * the other language (narrow rails and top bars). Both persist the choice (BR-L3).
 */
export function LanguageSwitcher({ variant = "full" }: { variant?: "full" | "compact" }) {
  const current = useLocale();
  const t = useTranslations("common");
  const [pending, setPending] = useState(false);
  /**
   * Saves the language, then reloads the page. A language switch changes the document's
   * `lang` and `dir`, every string and the text direction of every component; a full
   * reload applies all of that at once. A soft router refresh occasionally left the old
   * language on screen (reproduced ~1 in 15 switches), so it is not used here.
   */
  const switchTo = async (locale: Locale) => {
    setPending(true);
    try {
      const res = await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (res.ok) {
        window.location.reload();
        return; // keep the buttons disabled until the reload replaces the page
      }
    } catch {
      // network error: fall through and re-enable the switcher
    }
    setPending(false);
  };

  if (variant === "compact") {
    const other: Locale = current === "ar" ? "en" : "ar";
    return (
      <button
        type="button"
        lang={other}
        disabled={pending}
        onClick={() => switchTo(other)}
        aria-label={`${t("language")}: ${NATIVE_NAME[other]}`}
        title={NATIVE_NAME[other]}
        className="grid size-11 place-items-center rounded-xl border border-border bg-surface-2 text-sm font-bold text-text-muted transition-colors hover:text-text disabled:opacity-50"
      >
        {SHORT_NAME[other]}
      </button>
    );
  }

  return (
    <div role="group" aria-label={t("language")} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          disabled={pending}
          onClick={() => switchTo(locale)}
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
