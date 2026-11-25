import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { directionOf } from "@/i18n/config";
import { NotFoundView } from "@/components/system/not-found-view";
import { fontVariables } from "./fonts";
import "./globals.css";

// An address that matches no page. The app has two root layouts (staff, TV), so the framework
// needs this page-level fallback (next.config.ts `experimental.globalNotFound`) to show the app's
// own page instead of its unbranded default. Language: the staff cookie / Arabic (BR-L3).
export const metadata: Metadata = { title: "404 — DFN Arena", robots: { index: false, follow: false } };

export default async function GlobalNotFound() {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={directionOf(locale)} className={fontVariables}>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <NextIntlClientProvider>
          <NotFoundView />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
