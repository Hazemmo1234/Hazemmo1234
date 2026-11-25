import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { APP_TIMEZONE } from "@/lib/time";
import { isLocale, LOCALE_COOKIE, resolveLocale } from "./config";

/**
 * Staff screens: the `locale` cookie, which middleware keeps in sync with
 * profiles.locale (BR-L3). The TV passes its own locale explicitly (BR-L4), which
 * arrives here as `locale` and wins over the cookie.
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = isLocale(explicit) ? explicit : resolveLocale(null, (await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    locale,
    timeZone: APP_TIMEZONE,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
