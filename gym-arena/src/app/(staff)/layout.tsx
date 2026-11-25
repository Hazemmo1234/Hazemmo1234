import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { directionOf } from "@/i18n/config";
import { fontVariables } from "../fonts";
import "../globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: t("appName"),
    description: t("tagline"),
    applicationName: t("appName"),
    icons: {
      icon: [
        { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: "/brand/apple-touch-icon.png",
    },
    appleWebApp: { capable: true, title: t("appName"), statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = { themeColor: "#C42A1E", width: "device-width", initialScale: 1 };

// Root layout for staff screens. Language and direction come from the staff
// member's preference (BR-L2, BR-L3). The TV has its own root layout (BR-L4).
export default async function StaffRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={directionOf(locale)} className={fontVariables}>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
