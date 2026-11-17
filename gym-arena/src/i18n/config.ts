/** Languages (D15–D17). Language is presentation only — BR-L6. */
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar"; // BR-L1
export const LOCALE_COOKIE = "locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** BR-L2: Arabic is right-to-left, English left-to-right. */
export function directionOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** BR-L3 resolution order: profile → cookie → Arabic. */
export function resolveLocale(profileLocale: unknown, cookieLocale: unknown): Locale {
  if (isLocale(profileLocale)) return profileLocale;
  if (isLocale(cookieLocale)) return cookieLocale;
  return DEFAULT_LOCALE;
}
