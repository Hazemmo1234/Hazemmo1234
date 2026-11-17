import "server-only";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./config";

export const LOCALE_COOKIE_OPTIONS = { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" as const };

export async function writeLocaleCookie(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);
}
