import type { Metadata, Viewport } from "next";
import { directionOf } from "@/i18n/config";
import { getTvSettings } from "@/modules/tv/settings";
import { fontVariables } from "../fonts";
import "../globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "DFN Arena — TV", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0B0B0D" };

// Separate root layout: the TV's language and direction come from the Admin's TV
// setting and ignore any staff cookie on the device (BR-L4, D17).
export default async function TvRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getTvSettings();
  return (
    <html lang={locale} dir={directionOf(locale)} className={fontVariables}>
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
