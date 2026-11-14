import type { Locale } from "@/i18n/config";
import { APP_TIMEZONE, type IsoDate } from "@/lib/time";

/**
 * Locale-aware formatting with Western digits in both languages (BR-L5, D15).
 * Dates are calendar dates in Africa/Cairo; formatting never changes stored values.
 */
const INTL_LOCALE: Record<Locale, string> = { ar: "ar-EG-u-nu-latn", en: "en-GB" };

/** Integer display, rounded half-up (SCORING §5: 726.15 → 726; 726.5 → 727). */
export function formatPoints(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 0, useGrouping: false }).format(
    Math.floor(value + 0.5),
  );
}

export function formatNumber(value: number, locale: Locale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits, useGrouping: false }).format(value);
}

/** Long date in the selected language, e.g. "14 November 2026". */
export function formatDate(date: IsoDate, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: "UTC", // `date` is already a Cairo calendar date; format it as-is
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Live clock for the TV, in Cairo time. */
export function formatTime(instant: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}
